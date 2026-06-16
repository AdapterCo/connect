const { prisma } = require('../config/database');
const { createMercadoPagoPreference } = require('../services/mercadoPagoService');
const Log = require('../models/Log');
const Chat = require('../models/Chat');
const mercadopago = require('mercadopago');
const { decrypt } = require('../utils/crypto');
const { emitToCompany } = require('../config/socket');

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

async function handleWebhook(req, res) {
  // FIX CRÍTICO: Responder ao MercadoPago imediatamente para evitar retentativas
  res.status(200).send('OK');

  try {
    const { action, data, type } = req.body;

    if (action === 'payment.created' || action === 'payment.updated' || type === 'payment') {
      const paymentId = data?.id ? String(data.id) : null;
      if (!paymentId) return;

      // FIX CRÍTICO: Buscar qual empresa este pagamento pertence DIRETAMENTE no banco,
      // sem usar o token da empresa padrão (comp_default) que falha para outros tenants.
      const msgWithPayment = await prisma.message.findFirst({
        where: { payment_id: paymentId },
        include: {
          chat: {
            include: { company: true }
          }
        }
      });

      if (!msgWithPayment || !msgWithPayment.chat?.company) {
        console.log(`[Webhook MP] Pagamento ${paymentId} não associado a nenhum chat cadastrado.`);
        return;
      }

      const company = msgWithPayment.chat.company;
      const companyId = company.id;
      const chatId = msgWithPayment.chat.id;

      if (!company.mp_access_token || !company.mp_enabled) {
        console.log(`[Webhook MP] Empresa ${companyId} sem MP habilitado ou sem token.`);
        return;
      }

      // FIX: Descriptografar token da empresa correta para consultar o pagamento
      const accessToken = decrypt(company.mp_access_token);
      const client = new mercadopago.MercadoPagoConfig({ accessToken });
      const payment = new mercadopago.Payment(client);
      const freshDetails = await payment.get({ id: paymentId });

      const status = freshDetails.status;
      const value = freshDetails.transaction_amount;
      const item = freshDetails.description;

      // Atualizar status na mensagem
      await prisma.message.update({
        where: { id: msgWithPayment.id },
        data: { payment_status: status }
      });

      if (status === 'approved') {
        const chat = await Chat.findById(chatId, companyId);
        if (!chat) return;

        // Atualizar pedido pendente e imprimir
        const pendingOrder = await prisma.order.findFirst({
          where: { chat_id: chatId, status: 'pending' },
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

        await Chat.addMessage(chatId, {
          sender: 'system',
          text: `✅ Pagamento REAL de R$ ${Number(value).toFixed(2)} recebido com sucesso via Mercado Pago! (Item: ${item})`,
          timestamp: new Date(),
          is_ai: false
        });

        await Chat.addMessage(chatId, {
          sender: 'system',
          text: `🤖 Atendente IA: Alterando status do cliente de '${chat.status}' para 'finalizada'.`,
          timestamp: new Date(),
          is_ai: false
        });

        await Chat.update(chatId, { status: 'finalizada' }, companyId);
        await Log.add(`Mercado Pago REAL: Pagamento APROVADO para ${chat.client_name}. Status atualizado para 'finalizada'.`, companyId);

        const { getActiveConnections } = require('../services/whatsappService');
        const conn = getActiveConnections()[chat.instance_id || 'inst_default'];
        if (conn && conn.connectionStatus === 'open' && conn.sock) {
          try {
            await conn.sock.sendMessage(chatId, {
              text: `✅ *Pagamento Aprovado!*\n\nConfirmamos o recebimento de R$ ${Number(value).toFixed(2)} pelo item *${item}*. Obrigado!`
            });
          } catch (err) {
            console.error(err);
          }
        }

        // Emitir evento granular para atualizar apenas este chat no frontend
        const updatedChat = await Chat.findById(chatId, companyId);
        emitToCompany(companyId, 'chat_updated', updatedChat);
      }
    }
  } catch (err) {
    console.error('[Webhook MP] Erro ao processar webhook:', err);
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
  handleWebhook,
  checkPaymentStatus
};
