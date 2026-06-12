const mercadopago = require('mercadopago');
const { prisma } = require('../config/database');
const Chat = require('../models/Chat');
const Log = require('../models/Log');

async function createMercadoPagoPreference(chatId, item, value, settings) {
  const mpEnabled = settings.mp_enabled;
  const accessToken = settings.mp_access_token;

  if (!mpEnabled || !accessToken || accessToken.trim() === '' || accessToken === 'mock') {
    throw new Error('Módulo Mercado Pago inativo ou credenciais ausentes.');
  }

  const client = new mercadopago.MercadoPagoConfig({ accessToken: accessToken });
  const preference = new mercadopago.Preference(client);
  
  const response = await preference.create({
    body: {
      items: [
        {
          title: item,
          quantity: 1,
          unit_price: Number(value),
          currency_id: 'BRL'
        }
      ],
      metadata: {
        chat_id: chatId
      }
    }
  });

  return {
    id: response.id,
    url: response.init_point
  };
}

async function checkAllPendingPayments() {
  try {
    const chats = await prisma.chat.findMany({
      include: {
        messages: {
          orderBy: { timestamp: 'asc' }
        }
      }
    });

    for (const chat of chats) {
      const companyId = chat.company_id || 'comp_default';
      const company = await prisma.company.findUnique({
        where: { id: companyId }
      });

      if (!company || !company.mp_access_token || !company.mp_enabled) continue;

      const pendingMessages = chat.messages.filter(m => m.payment_id && m.payment_status === 'pending');
      if (pendingMessages.length === 0) continue;

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

              const approvedValue = approvedPayment.transaction_amount;
              const approvedItem = approvedPayment.description || 'Produto';
              
               const oldStatus = chat.status;
              await Chat.update(chat.id, { status: 'finalizada' }, companyId);

              // Find and auto-print pending order in this chat
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
                  const printService = require('./printService');
                  await printService.printOrder(pendingOrder.id);
                } catch (printErr) {
                  console.error('[Auto Print] Failed to print paid order:', printErr);
                }
              }

              const confirmMsg1 = {
                sender: 'system',
                text: `✅ Pagamento REAL de R$ ${Number(approvedValue).toFixed(2)} recebido com sucesso via Mercado Pago! (Item: ${approvedItem})`,
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
              
              await Log.add(`Mercado Pago REAL (Auto-Sincronização): Pagamento APROVADO para ${chat.client_name}. Status atualizado para 'finalizada'.`, companyId);

              const { getActiveConnections } = require('./whatsappService');
              const conn = getActiveConnections()[chat.instance_id || 'inst_default'];
              if (conn && conn.connectionStatus === 'open' && conn.sock) {
                try {
                  const targetJid = chat.id.endsWith('@lid') ? chat.id.replace('@lid', '@s.whatsapp.net') : chat.id;
                  await conn.sock.sendMessage(targetJid, { 
                    text: `✅ *Pagamento Aprovado!*\n\nConfirmamos o recebimento de R$ ${Number(approvedValue).toFixed(2)} pelo item *${approvedItem}*. Obrigado!` 
                  });
                } catch (err) {
                  console.error(err);
                }
              }
            }
          }
        } catch (err) {
          console.error(err);
        }
      }
    }
  } catch (error) {
    console.error('Error checking pending payments:', error);
  }
}

module.exports = {
  createMercadoPagoPreference,
  checkAllPendingPayments
};
