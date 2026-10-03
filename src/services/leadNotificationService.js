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
  await require('./pushService').send(sellerId, chat.company_id, 'Novo lead atribuído. Confirme o atendimento.', `lead-${chat.id}`).catch(error => console.error('Lead push failed:', error.code || error.name));
  try {
    const seller = await prisma.user.findFirst({
      where: { id: sellerId, company_id: chat.company_id },
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
        select: { client_phone: true, company_id: true, opportunity: { select: { product: true, variant: true, payment: true, purchase_confirmed: true } }, messages: { where: { sender: 'system', is_note: true }, orderBy: { timestamp: 'desc' }, take: 30 } }
      });
      if (fresh?.company_id === chat.company_id && fresh.messages) chat = { ...chat, messages: [...fresh.messages].reverse() };
      if (fresh?.company_id === chat.company_id && fresh.opportunity) chat = { ...chat, qualification_memory: fresh.opportunity };
      if (fresh && fresh.client_phone) {
        clientDigits = normalizeDigits(fresh.client_phone) || fresh.client_phone;
      }
    }

    if (clientDigits) {
      const internalCandidates = [clientDigits, clientDigits.replace(/^55/, '')];
      if (!clientDigits.startsWith('55')) internalCandidates.push('55' + clientDigits);
      const isInternal = await prisma.user.findFirst({
        where: {
          company_id: chat.company_id,
          phone: { in: internalCandidates }
        }
      });
      if (isInternal) return;
    }

    const clientName = chat.client_name || 'Cliente';
    const { previousQualification, sellerBrief } = require('./leadQualificationService');
    const brief = sellerBrief(previousQualification(chat), false);

    const text = `🚨 *Novo Lead Atribuído!*\n\n` +
      `👤 *Cliente:* ${clientName}\n` +
      `📱 *Telefone:* +${clientDigits}\n\n` +
      `👉 *Iniciar conversa:* https://wa.me/${clientDigits}\n\n` +
      `*Triagem e contexto:*\n${brief}\n\n` +
      `*Para confirmar e pausar o rodízio:* responda a esta mensagem com "CONFIRMAR", envie "CONFIRMAR ${chat.id}" ou responda ao cliente pelo seu chip conectado/painel do Connect.`;

    const whatsappService = require('./whatsappService');
    const connections = whatsappService.getActiveConnections();
    let instanceId = chat.instance_id;

    if (!connections[instanceId] || connections[instanceId].connectionStatus !== 'open') {
      const openId = Object.keys(connections).find(id => connections[id]?.connectionStatus === 'open' && connections[id]?.companyId === chat.company_id);
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
