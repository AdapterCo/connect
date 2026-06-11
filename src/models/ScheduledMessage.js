const { prisma } = require('../config/database');

function mapToAppFormat(sm) {
  if (!sm) return null;
  return {
    id: sm.id,
    chatId: sm.chat_id,
    clientName: sm.client_name,
    text: sm.text,
    scheduledTime: sm.scheduledTime.toISOString(),
    mediaUrl: sm.media_url,
    mediaType: sm.media_type,
    fileName: sm.file_name,
    created_by: sm.created_by,
    company_id: sm.company_id,
    created_at: sm.created_at.toISOString()
  };
}

async function findAll(companyId) {
  const list = await prisma.scheduledMessage.findMany({
    where: { company_id: companyId }
  });
  return list.map(mapToAppFormat);
}

async function findAllPending() {
  const list = await prisma.scheduledMessage.findMany();
  return list.map(mapToAppFormat);
}

async function create(message, companyId) {
  const dbRecord = await prisma.scheduledMessage.create({
    data: {
      id: message.id,
      chat_id: message.chatId || message.chat_id,
      client_name: message.clientName || message.client_name,
      text: message.text || null,
      scheduledTime: new Date(message.scheduledTime),
      media_url: message.mediaUrl || message.media_url || null,
      media_type: message.mediaType || message.media_type || null,
      file_name: message.fileName || message.file_name || null,
      created_by: message.created_by,
      company_id: companyId
    }
  });
  return mapToAppFormat(dbRecord);
}

async function remove(id, companyId) {
  try {
    await prisma.scheduledMessage.deleteMany({
      where: { id, company_id: companyId }
    });
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  findAll,
  findAllPending,
  create,
  remove
};
