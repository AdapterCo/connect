const Chat = require('../models/Chat');
const { withCompanyLock } = require('./salesRotationService');

function identity(remoteJid, alternativeJid) {
  const jids = [...new Set([remoteJid, alternativeJid].filter(jid => typeof jid === 'string' && /@(s\.whatsapp\.net|lid)$/.test(jid)))];
  const phoneJid = jids.find(jid => jid.endsWith('@s.whatsapp.net'));
  const phone = phoneJid?.split('@')[0].split(':')[0] || null;
  return { jids, phone };
}

async function findOrCreate(companyId, instanceId, remoteJid, alternativeJid, defaults) {
  const contact = identity(remoteJid, alternativeJid);
  if (!contact.jids.length) throw new Error('Identificador de contato invalido.');
  return withCompanyLock(companyId, async tx => {
    const OR = [{ remote_jid: { in: contact.jids } }, { id: { in: contact.jids } }];
    if (contact.phone) OR.push({ client_phone: contact.phone });
    let chat = await tx.chat.findFirst({
      where: { company_id: companyId, instance_id: instanceId, OR },
      orderBy: { created_at: 'asc' }, include: { messages: { orderBy: { timestamp: 'asc' } } }
    });
    if (chat) {
      const data = {};
      if (contact.phone && chat.client_phone !== contact.phone) data.client_phone = contact.phone;
      // Retain the LID alias; PN events can always match client_phone.
      const lid = contact.jids.find(jid => jid.endsWith('@lid'));
      if (lid && chat.remote_jid !== lid) data.remote_jid = lid;
      if (Object.keys(data).length) chat = await tx.chat.update({ where: { id: chat.id }, data, include: { messages: { orderBy: { timestamp: 'asc' } } } });
      return { chat, created: false };
    }
    chat = await Chat.create({ ...defaults, id: Chat.createChatId(companyId, instanceId, contact.phone ? `${contact.phone}@s.whatsapp.net` : remoteJid), remote_jid: remoteJid, client_phone: contact.phone || remoteJid.split('@')[0], instance_id: instanceId }, companyId, tx);
    return { chat, created: true };
  });
}

module.exports = { identity, findOrCreate };
