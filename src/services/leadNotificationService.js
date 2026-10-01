const { prisma } = require('../config/database');

function normalizeDigits(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith('55')) {
    return '55' + digits;
  }
  return digits;
}

async function notifySeller(chat, sellerId) {
  if (!sellerId || !chat) return;
  try {
    const seller = await prisma.user.findFirst({
      where: { id: sellerId },
      select: { id: true, name: true, phone: true }
    });
    if (!seller || !seller.phone) return;

    const cleanSellerPhone = normalizeDigits(seller.phone);
    if (!cleanSellerPhone) return;

    const sellerJid = `${cleanSellerPhone}@s.whatsapp.net`;
    let clientDigits = normalizeDigits(chat.client_phone) || chat.client_phone;
    if (chat.id) {
      const fresh = await prisma.chat.findUnique({
        where: { id: chat.id },
        select: { client_phone: true }
      });
      if (fresh && fresh.client_phone) {
        clientDigits = normalizeDigits(fresh.client_phone) || fresh.client_phone;
      }
    }
    const clientName = chat.client_name || 'Cliente';

    const text = `🚨 *Novo Lead Atribuído!*\n\n` +
      `👤 *Cliente:* ${clientName}\n` +
      `📱 *Telefone:* +${clientDigits}\n\n` +
      `👉 *Iniciar conversa no WhatsApp:* https://wa.me/${clientDigits}\n\n` +
      `Ou responda diretamente pelo painel do Connect.`;

    const whatsappService = require('./whatsappService');
    const connections = whatsappService.getActiveConnections();
    let instanceId = chat.instance_id;

    if (!connections[instanceId] || connections[instanceId].connectionStatus !== 'open') {
      const openId = Object.keys(connections).find(id => connections[id]?.connectionStatus === 'open');
      if (openId) instanceId = openId;
    }

    if (instanceId && connections[instanceId]?.connectionStatus === 'open') {
      await whatsappService.sendMessage(instanceId, sellerJid, { text });
    }
  } catch (err) {
    console.error('[LeadNotification] Erro ao notificar vendedor:', err && err.message ? err.message : err);
  }
}

module.exports = { notifySeller, normalizeDigits };
