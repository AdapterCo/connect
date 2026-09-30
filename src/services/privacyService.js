const crypto = require('crypto');
const { prisma } = require('../config/database');
const auditService = require('./auditService');
const { removeChatMedia } = require('../utils/media');

function anonymizedLabel(chatId) {
  return `anon-${crypto.createHash('sha256').update(chatId).digest('hex').slice(0, 12)}`;
}

async function getChatForPrivacy(companyId, chatId) {
  return prisma.chat.findFirst({
    where: { id: chatId, company_id: companyId },
    include: {
      messages: { orderBy: { timestamp: 'asc' } },
      flow_session: true,
      orders: {
        include: {
          items: {
            include: {
              addons: true
            }
          }
        }
      }
    }
  });
}

async function exportClientData({ companyId, chatId, actor }) {
  const chat = await getChatForPrivacy(companyId, chatId);
  if (!chat) return null;

  await auditService.log({
    company_id: companyId,
    user_id: actor?.id,
    user_name: actor?.name || actor?.username,
    action: 'export_client_data',
    entity: 'privacy',
    entity_id: chatId,
    details: JSON.stringify({ chat_id: chatId })
  });

  return {
    exported_at: new Date().toISOString(),
    company_id: companyId,
    chat
  };
}

async function anonymizeClientData({ companyId, chatId, actor }) {
  const chat = await getChatForPrivacy(companyId, chatId);
  if (!chat) return null;

  const label = anonymizedLabel(chatId);
  const removedMedia = await removeChatMedia(chatId);

  await prisma.$transaction(async (tx) => {
    await tx.message.updateMany({
      where: { chat_id: chatId },
      data: {
        text: '[mensagem anonimizada]',
        sender_id: null,
        media_url: null,
        media_type: null,
        file_name: null,
        payment_url: null
      }
    });

    // Respostas captadas pelo fluxo (nome, e-mail, telefone...) sao dados pessoais.
    await tx.flowSession.updateMany({
      where: { chat_id: chatId, company_id: companyId },
      data: { variables: {}, status: 'cancelled', current_node_id: null }
    });

    await tx.order.updateMany({
      where: { chat_id: chatId, company_id: companyId },
      data: {
        notes: null
      }
    });

    await tx.chat.updateMany({
      where: { id: chatId, company_id: companyId },
      data: {
        client_name: 'Cliente anonimizado',
        client_phone: label,
        tags: [],
        assigned_to: null,
        ai_active: false,
        is_favorite: false,
        is_archived: true,
        is_blocked: true,
        sector: null
      }
    });
  });

  await auditService.log({
    company_id: companyId,
    user_id: actor?.id,
    user_name: actor?.name || actor?.username,
    action: 'anonymize_client_data',
    entity: 'privacy',
    entity_id: chatId,
    details: JSON.stringify({ chat_id: chatId, anonymized_label: label, removed_media: removedMedia })
  });

  return getChatForPrivacy(companyId, chatId);
}

async function deleteClientData({ companyId, chatId, actor }) {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, company_id: companyId },
    select: { id: true, client_name: true }
  });
  if (!chat) return false;

  const removedMedia = await removeChatMedia(chatId);
  await prisma.chat.deleteMany({
    where: { id: chatId, company_id: companyId }
  });

  await auditService.log({
    company_id: companyId,
    user_id: actor?.id,
    user_name: actor?.name || actor?.username,
    action: 'delete_client_data',
    entity: 'privacy',
    entity_id: chatId,
    details: JSON.stringify({ chat_id: chatId, client_name: chat.client_name, removed_media: removedMedia })
  });

  return true;
}

module.exports = {
  exportClientData,
  anonymizeClientData,
  deleteClientData
};
