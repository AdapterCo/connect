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

// Recarrega telefone verificado e triagem do lead antes de notificar.
async function loadLead(chat) {
  if (!chat.id) return chat;
  const fresh = await prisma.chat.findUnique({
    where: { id: chat.id },
    select: { client_phone: true, remote_jid: true, company_id: true, opportunity: { select: { product: true, variant: true, payment: true, purchase_confirmed: true } }, messages: { where: { sender: 'system', is_note: true }, orderBy: { timestamp: 'desc' }, take: 30 } }
  });
  if (fresh?.company_id !== chat.company_id) return chat;
  return {
    ...chat,
    client_phone: fresh.client_phone,
    remote_jid: fresh.remote_jid || chat.remote_jid,
    ...(fresh.messages ? { messages: [...fresh.messages].reverse() } : {}),
    ...(fresh.opportunity ? { qualification_memory: fresh.opportunity } : {})
  };
}

// Conversa iniciada por alguem da equipe nao vira lead.
async function isStaffLead(chat, clientDigits) {
  if (!clientDigits) return false;
  const candidates = [clientDigits, clientDigits.replace(/^55/, '')];
  if (!clientDigits.startsWith('55')) candidates.push('55' + clientDigits);
  return !!await prisma.user.findFirst({ where: { company_id: chat.company_id, phone: { in: candidates } } });
}

async function sendToSeller(chat, sellerId, text) {
  const seller = await prisma.user.findFirst({
    where: { id: sellerId, company_id: chat.company_id },
    select: { id: true, name: true, phone: true }
  });
  if (!seller || !seller.phone) { console.warn('[LeadNotification] Seller missing or phone not configured.'); return false; }
  const cleanSellerPhone = normalizeDigits(seller.phone);
  if (!cleanSellerPhone) return false;

  const whatsappService = require('./whatsappService');
  const connections = whatsappService.getActiveConnections();
  const open = id => connections[id]?.connectionStatus === 'open' && connections[id]?.companyId === chat.company_id;
  // Enviar do chip do proprio vendedor cai no "Voce" do WhatsApp dele, onde a resposta
  // ACEITAR chega como mensagem propria. Prefere a conexao do lead, depois qualquer outra.
  const otherNumber = id => normalizeDigits(connections[id]?.connectedPhone) !== cleanSellerPhone;
  const candidates = [chat.instance_id, ...Object.keys(connections).filter(id => id !== chat.instance_id)].filter(id => id && open(id));
  const instanceId = candidates.find(otherNumber) || candidates[0];
  if (!instanceId) {
    console.warn('[LeadNotification] No open WhatsApp connection available.');
    return false;
  }
  await whatsappService.sendMessage(instanceId, `${cleanSellerPhone}@s.whatsapp.net`, { text });
  return true;
}

// Primeiro aviso: so a chegada do lead e a posicao no ranking, sem dados do cliente.
async function notifySeller(chat, sellerId) {
  if (!sellerId || !chat) return;
  await require('./pushService').send(sellerId, chat.company_id, 'Novo lead aguardando seu aceite.', `lead-${chat.id}`).catch(error => console.error('Lead push failed:', error.code || error.name));
  try {
    const lead = await loadLead(chat);
    if (await isStaffLead(lead, require('./chatIdentityService').phoneForChat(lead))) return;
    const standing = await require('./leadRankingService').standing(chat.company_id, sellerId);
    const text = '🔔 *Novo lead para você!*\n\n' +
      'Responda *ACEITAR* em até 1 minuto para receber os dados do cliente e a triagem completa. ' +
      'Se não aceitar, o lead passa para o próximo vendedor.' +
      (standing ? `\n\n${standing}` : '');
    await sendToSeller(lead, sellerId, text);
  } catch (err) {
    console.error('[LeadNotification] Erro ao notificar vendedor:', err && err.message ? err.message : err);
  }
}

// Dados completos do lead, enviados so depois do aceite.
async function sendLeadDetails(chat, sellerId, { title = '✅ *Lead aceito!*', footer = '' } = {}) {
  if (!sellerId || !chat) return;
  const lead = await loadLead(chat);
  const clientDigits = require('./chatIdentityService').phoneForChat(lead);
  if (await isStaffLead(lead, clientDigits)) return;
  const { previousQualification, sellerBrief } = require('./leadQualificationService');
  const text = `${title}\n\n` +
    `👤 *Cliente:* ${lead.client_name || 'Cliente'}\n` +
    (clientDigits ? `📱 *Telefone:* +${clientDigits}\n\n👉 *Iniciar conversa:* https://wa.me/${clientDigits}\n\n`
      : '📱 *Telefone:* aguardando identificação pelo WhatsApp. O identificador interno não é um número para contato.\n\n') +
    `*Triagem e contexto:*\n${sellerBrief(previousQualification(lead), false)}` +
    (footer ? `\n\n${footer}` : '');
  await sendToSeller(lead, sellerId, text);
}

async function notifyAccepted(chat, sellerId) {
  try {
    const standing = await require('./leadRankingService').standing(chat.company_id, sellerId);
    await sendLeadDetails(chat, sellerId, { footer: '+1 ponto no ranking.' + (standing ? ` ${standing}` : '') });
  } catch (err) {
    console.error('[LeadNotification] Erro ao enviar lead aceito:', err && err.message ? err.message : err);
  }
}

module.exports = { notifySeller, notifyAccepted, sendLeadDetails, normalizeDigits };
