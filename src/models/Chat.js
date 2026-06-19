const { prisma } = require('../config/database');
const crypto = require('crypto');

function createChatId(companyId, instanceId, remoteJid) {
  const hash = crypto
    .createHash('sha256')
    .update(`${companyId}:${instanceId}:${remoteJid}`)
    .digest('hex')
    .slice(0, 24);
  return `chat_${hash}`;
}

function getRemoteJid(chat) {
  return chat?.remote_jid || chat?.id;
}

async function findAll(companyId) {
  return prisma.chat.findMany({
    where: { company_id: companyId },
    include: {
      messages: {
        orderBy: { timestamp: 'asc' }
      }
    }
  });
}

async function findById(id, companyId) {
  return prisma.chat.findFirst({
    where: { id, company_id: companyId },
    include: {
      messages: {
        orderBy: { timestamp: 'asc' }
      }
    }
  });
}

async function findByRemoteJid(remoteJid, companyId, instanceId) {
  return prisma.chat.findFirst({
    where: {
      company_id: companyId,
      instance_id: instanceId,
      OR: [
        { remote_jid: remoteJid },
        { id: remoteJid }
      ]
    },
    include: {
      messages: {
        orderBy: { timestamp: 'asc' }
      }
    }
  });
}

async function create(chat, companyId) {
  const instanceId = chat.instance_id || 'inst_default';
  const remoteJid = chat.remote_jid || chat.id;
  const id = chat.id || createChatId(companyId, instanceId, remoteJid);

  return prisma.chat.create({
    data: {
      id,
      remote_jid: remoteJid,
      client_name: chat.client_name,
      client_phone: chat.client_phone,
      status: chat.status || 'iniciada',
      assigned_to: chat.assigned_to || null,
      ai_active: chat.ai_active !== undefined ? chat.ai_active : true,
      tags: chat.tags || [],
      is_favorite: chat.is_favorite || false,
      is_archived: chat.is_archived || false,
      is_blocked: chat.is_blocked || false,
      sector: chat.sector || null,
      company_id: companyId,
      instance_id: instanceId,
      waiting_since: chat.waiting_since ? new Date(chat.waiting_since) : null,
      claimed_at: chat.claimed_at ? new Date(chat.claimed_at) : null
    },
    include: {
      messages: {
        orderBy: { timestamp: 'asc' }
      }
    }
  });
}

async function update(id, updates, companyId) {
  const data = {};
  if (updates.remote_jid !== undefined) data.remote_jid = updates.remote_jid;
  if (updates.client_name !== undefined) data.client_name = updates.client_name;
  if (updates.client_phone !== undefined) data.client_phone = updates.client_phone;
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.assigned_to !== undefined) data.assigned_to = updates.assigned_to;
  if (updates.ai_active !== undefined) data.ai_active = updates.ai_active;
  if (updates.tags !== undefined) data.tags = updates.tags;
  if (updates.is_favorite !== undefined) data.is_favorite = updates.is_favorite;
  if (updates.is_archived !== undefined) data.is_archived = updates.is_archived;
  if (updates.is_blocked !== undefined) data.is_blocked = updates.is_blocked;
  if (updates.sector !== undefined) data.sector = updates.sector;
  if (updates.instance_id !== undefined) data.instance_id = updates.instance_id;
  if (updates.waiting_since !== undefined) data.waiting_since = updates.waiting_since ? new Date(updates.waiting_since) : null;
  if (updates.claimed_at !== undefined) data.claimed_at = updates.claimed_at ? new Date(updates.claimed_at) : null;

  const existing = await prisma.chat.findFirst({
    where: { id, company_id: companyId }
  });
  if (!existing) return null;

  return prisma.chat.update({
    where: { id },
    data,
    include: {
      messages: {
        orderBy: { timestamp: 'asc' }
      }
    }
  });
}

async function remove(id, companyId) {
  try {
    await prisma.chat.deleteMany({
      where: { id, company_id: companyId }
    });
    return true;
  } catch (err) {
    return false;
  }
}

async function addMessage(chatId, msg) {
  return prisma.message.create({
    data: {
      id: msg.id && !msg.id.startsWith('msg_') ? msg.id : undefined,
      chat_id: chatId,
      sender: msg.sender,
      sender_id: msg.sender_id || null,
      text: msg.text,
      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
      is_ai: msg.is_ai || false,
      is_note: msg.is_note || false,
      is_scheduled: msg.is_scheduled || false,
      media_url: msg.media_url || null,
      media_type: msg.media_type || null,
      file_name: msg.file_name || null,
      payment_id: msg.payment_id || null,
      payment_url: msg.payment_url || null,
      payment_status: msg.payment_status || null
    }
  });
}

async function updateMessagePaymentStatus(paymentId, status) {
  return prisma.message.updateMany({
    where: { payment_id: paymentId },
    data: { payment_status: status }
  });
}

module.exports = {
  createChatId,
  getRemoteJid,
  findAll,
  findById,
  findByRemoteJid,
  create,
  update,
  remove,
  addMessage,
  updateMessagePaymentStatus
};
