const { prisma } = require('../config/database');
const { createMercadoPagoPreference } = require('../services/mercadoPagoService');
const Log = require('../models/Log');
const Chat = require('../models/Chat');
const mercadopago = require('mercadopago');

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

    const settings = await prisma.settings.findUnique({
      where: { company_id: req.user.company_id }
    }) || await prisma.settings.findUnique({
      where: { company_id: 'comp_default' }
    });

    const mpSettings = {
      ...settings,
      mp_enabled: company?.mp_enabled || false,
      mp_access_token: company?.mp_access_token || '',
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
  try {
    const { action, data, type } = req.body;
    
    if (action === 'payment.created' || action === 'payment.updated' || type === 'payment') {
      const paymentId = data?.id || req.body?.data?.id;
      if (paymentId) {
        let chatId = null;
        let companyId = 'comp_default';
        
        const defaultCompany = await prisma.company.findUnique({
          where: { id: 'comp_default' }
        });

        if (defaultCompany && defaultCompany.mp_access_token) {
          try {
            const tempClient = new mercadopago.MercadoPagoConfig({ accessToken: defaultCompany.mp_access_token });
            const tempPayment = new mercadopago.Payment(tempClient);
            const paymentDetails = await tempPayment.get({ id: paymentId });
            chatId = paymentDetails.metadata?.chat_id;
          } catch (e) {
            console.error('Error fetching details with default token:', e);
          }
        }
        
        if (chatId) {
          const chat = await prisma.chat.findUnique({
            where: { id: chatId }
          });
          if (chat) {
            companyId = chat.company_id || 'comp_default';
          }
        }

        const company = await prisma.company.findUnique({
          where: { id: companyId }
        });

        if (company && company.mp_access_token) {
          const client = new mercadopago.MercadoPagoConfig({ accessToken: company.mp_access_token });
          const payment = new mercadopago.Payment(client);
          const freshDetails = await payment.get({ id: paymentId });
          
          const status = freshDetails.status;
          const value = freshDetails.transaction_amount;
          const item = freshDetails.description;

          if (chatId) {
            const chat = await Chat.findById(chatId, companyId);
            if (chat) {
              const matchingMsg = chat.messages.find(m => m.payment_id === paymentId);
              if (matchingMsg) {
                await prisma.message.update({
                  where: { id: matchingMsg.id },
                  data: { payment_status: status }
                });
              }

              if (status === 'approved') {
                const confirmMsg1 = {
                  sender: 'system',
                  text: `✅ Pagamento REAL de R$ ${Number(value).toFixed(2)} recebido com sucesso via Mercado Pago! (Item: ${item})`,
                  timestamp: new Date(),
                  is_ai: false
                };
                
                const confirmMsg2 = {
                  sender: 'system',
                  text: `🤖 Atendente IA: Alterando status do cliente de '${chat.status}' para 'finalizada'.`,
                  timestamp: new Date(),
                  is_ai: false
                };

                await Chat.addMessage(chat.id, confirmMsg1);
                await Chat.addMessage(chat.id, confirmMsg2);
                await Chat.update(chat.id, { status: 'finalizada' }, companyId);

                await Log.add(`Mercado Pago REAL: Pagamento APROVADO para ${chat.client_name}. Status updated to 'finalizada'.`, companyId);

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
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
  
  res.status(200).send('OK');
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

    let updated = false;
    let approvedValue = 0;
    let approvedItem = '';

    for (const msg of pendingMessages) {
      try {
        const response = await fetch(`https://api.mercadopago.com/v1/payments/search?preference_id=${msg.payment_id}`, {
          headers: {
            'Authorization': `Bearer ${company.mp_access_token}`
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
      
      const confirmMsg1 = {
        sender: 'system',
        text: `✅ Pagamento REAL de R$ ${Number(approvedValue).toFixed(2)} verificado e aprovado via Mercado Pago! (Item: ${approvedItem})`,
        timestamp: new Date(),
        is_ai: false
      };

      const confirmMsg2 = {
        sender: 'system',
        text: `🤖 Atendente IA: Alterando status do cliente de '${oldStatus}' para 'finalizada'.`,
        timestamp: new Date(),
        is_ai: false
      };

      await Chat.addMessage(chat.id, confirmMsg1);
      await Chat.addMessage(chat.id, confirmMsg2);
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
