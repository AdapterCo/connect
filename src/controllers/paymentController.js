const { prisma } = require('../config/database');
const { createMercadoPagoPreference } = require('../services/mercadoPagoService');
const Log = require('../models/Log');
const Chat = require('../models/Chat');
const { decrypt } = require('../utils/crypto');

async function createCharge(req, res) {
  try {
    const { item, value } = req.body;
    if (!item || !value) {
      return res.status(400).json({ error: 'Item e valor da cobrança são obrigatórios.' });
    }

    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    const company = await prisma.company.findUnique({
      where: { id: req.user.company_id }
    });

    // FIX: Removido fallback para comp_default (vazamento de credenciais)
    // FIX: Descriptografar mp_access_token antes de passar ao serviço
    const mpSettings = {
      mp_enabled: company?.mp_enabled || false,
      mp_access_token: company?.mp_access_token ? decrypt(company.mp_access_token) : '',
      mp_public_key: company?.mp_public_key || ''
    };

    const paymentData = await createMercadoPagoPreference(req.params.id, item, value, mpSettings);

    const paymentMsg = {
      sender: 'system',
      text: `🔗 Cobrança Gerada: ${item} - R$ ${Number(value).toFixed(2)}. Link para pagar: ${paymentData.url}`,
      timestamp: new Date(),
      is_ai: false,
      payment_id: paymentData.id,
      payment_url: paymentData.url,
      payment_status: 'pending'
    };

    const createdMsg = await Chat.addMessage(chat.id, paymentMsg);
    const updatedChat = await Chat.update(chat.id, { status: 'interesse em compra' }, req.user.company_id);

    // Criar Order automaticamente para vincular ao pagamento
    await prisma.order.create({
      data: {
        chat_id: chat.id,
        status: 'pending',
        subtotal: Number(value),
        discount: 0,
        total: Number(value),
        payment_method: 'mercadopago',
        payment_status: 'pending',
        notes: `${item} (via link de pagamento)`,
        company_id: req.user.company_id
      }
    });

    await Log.add(`Cobrança gerada manualmente por ${req.user.name}: ${item} (R$ ${value})`, req.user.company_id);

    const { getActiveConnections } = require('../services/whatsappService');
    const conn = getActiveConnections()[chat.instance_id || 'inst_default'];
    if (conn && conn.connectionStatus === 'open' && conn.sock) {
      try {
        await conn.sock.sendMessage(chat.id, {
          text: `💳 *Link de Pagamento Manual!*\n\n*Item:* ${item}\n*Valor:* R$ ${Number(value).toFixed(2)}\n\nLink para pagamento: ${paymentData.url}`
        });
      } catch (err) {
        console.error(err);
      }
    }

    res.json({ success: true, paymentMessage: { ...createdMsg, timestamp: createdMsg.timestamp.toISOString() } });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao gerar cobrança: ' + error.message });
  }
}

async function checkPaymentStatus(req, res) {
  try {
    const chatId = req.params.id;
    const chat = await Chat.findById(chatId, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado.' });
    }

    const company = await prisma.company.findUnique({
      where: { id: req.user.company_id }
    });

    if (!company || !company.mp_access_token) {
      return res.status(400).json({ error: 'Token do Mercado Pago não configurado.' });
    }

    const pendingMessages = chat.messages.filter(m => m.payment_id && m.payment_status === 'pending');
    if (pendingMessages.length === 0) {
      return res.json({ message: 'Nenhum pagamento pendente encontrado neste chat.', chat });
    }

    // FIX: Descriptografar token antes de usar
    const accessToken = decrypt(company.mp_access_token);

    let updated = false;
    let approvedValue = 0;
    let approvedItem = '';

    for (const msg of pendingMessages) {
      try {
        const response = await fetch(`https://api.mercadopago.com/v1/payments/search?preference_id=${msg.payment_id}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          const payments = data.results || [];

          const approvedPayment = payments.find(p => p.status === 'approved');
          if (approvedPayment) {
            await prisma.message.update({
              where: { id: msg.id },
              data: { payment_status: 'approved' }
            });
            approvedValue = approvedPayment.transaction_amount;
            approvedItem = approvedPayment.description || 'Produto';
            updated = true;
          }
        }
      } catch (err) {
        console.error(err);
      }
    }

    if (updated) {
      const oldStatus = chat.status;

      const pendingOrder = await prisma.order.findFirst({
        where: { chat_id: chat.id, status: 'pending' },
        orderBy: { created_at: 'desc' }
      });

      if (pendingOrder) {
        await prisma.order.update({
          where: { id: pendingOrder.id },
          data: { payment_status: 'paid', status: 'preparing' }
        });
        try {
          const printService = require('../services/printService');
          await printService.printOrder(pendingOrder.id);
        } catch (printErr) {
          console.error('[Auto Print] Failed to print paid order:', printErr);
        }
      }

      await Chat.addMessage(chat.id, {
        sender: 'system',
        text: `✅ Pagamento REAL de R$ ${Number(approvedValue).toFixed(2)} verificado e aprovado via Mercado Pago! (Item: ${approvedItem})`,
        timestamp: new Date(),
        is_ai: false
      });

      await Chat.addMessage(chat.id, {
        sender: 'system',
        text: `🤖 Atendente IA: Alterando status do cliente de '${oldStatus}' para 'finalizada'.`,
        timestamp: new Date(),
        is_ai: false
      });

      const finalChat = await Chat.update(chat.id, { status: 'finalizada' }, req.user.company_id);
      await Log.add(`Mercado Pago REAL (Verificação Manual): Pagamento APROVADO para ${chat.client_name}. Status atualizado para 'finalizada'.`, req.user.company_id);

      const { getActiveConnections } = require('../services/whatsappService');
      const conn = getActiveConnections()[chat.instance_id || 'inst_default'];
      if (conn && conn.connectionStatus === 'open' && conn.sock) {
        try {
          await conn.sock.sendMessage(chatId, {
            text: `✅ *Pagamento Aprovado!*\n\nConfirmamos o recebimento de R$ ${Number(approvedValue).toFixed(2)} pelo item *${approvedItem}*. Obrigado!`
          });
        } catch (err) {
          console.error(err);
        }
      }

      return res.json({ success: true, verified: true, chat: finalChat });
    }

    const currentChat = await Chat.findById(chatId, req.user.company_id);
    res.json({ success: true, verified: false, chat: currentChat });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar status de pagamento.' });
  }
}

module.exports = {
  createCharge,
  checkPaymentStatus
};
