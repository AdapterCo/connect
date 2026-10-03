const crypto = require('crypto');
const { prisma } = require('../config/database');
const auditService = require('./auditService');
const cleanup = require('./mediaCleanupService');

function anonymizedLabel(chatId) {
  return `anon-${crypto.createHash('sha256').update(chatId).digest('hex').slice(0, 12)}`;
}

async function getChatForPrivacy(companyId, chatId) {
  return prisma.chat.findFirst({
    where: { id: chatId, company_id: companyId },
    include: {
      messages: { orderBy: { timestamp: 'asc' } },
      flow_session: true,
      opportunity: { include: { tasks: true, sales: { include: { receipts: true, after_sales: true } } } },
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
  const media = await prisma.message.findMany({ where: { chat_id: chatId, media_url: { not: null } }, select: { media_url: true } });
  const schedules = await prisma.scheduledMessage.findMany({ where: { chat_id: chatId }, select: { media_url: true } });
  const urls = [...media, ...schedules].map(m => m.media_url).filter(Boolean);
  const removedMedia = urls.length;

  await prisma.$transaction(async (tx) => {
    if (chat.opportunity_id) {
      await require('./commercialService').lock(tx, companyId);
      await tx.opportunity.updateMany({ where: { id: chat.opportunity_id, company_id: companyId }, data: {
        client_name: 'Cliente anonimizado', phone: label, product: null, variant: null, payment: null,
        purchase_confirmed: false, lost_reason: null, seller_id: null, status: 'lost'
      } });
      await tx.followUpTask.updateMany({ where: { opportunity_id: chat.opportunity_id, company_id: companyId }, data: { title: '[tarefa anonimizada]', completed_at: new Date() } });
      await tx.product.updateMany({ where: { reserved_lead_id: chat.opportunity_id, company_id: companyId }, data: { reserved_lead_id: null, reserved_by: null, reserved_until: null } });
      await tx.saleReceipt.updateMany({ where: { company_id: companyId, sale: { opportunity_id: chat.opportunity_id } }, data: { reference: null } });
      await tx.afterSale.updateMany({ where: { company_id: companyId, sale: { opportunity_id: chat.opportunity_id } }, data: { description: '[solicitação anonimizada]', resolution: null } });
    }
    await cleanup.enqueue(tx, urls);
    await tx.scheduledMessage.deleteMany({ where: { chat_id: chatId, company_id: companyId } });
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
        remote_jid: null,
        sales_reply_due_at: null,
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
    details: JSON.stringify({ chat_id: chatId, anonymized_label: label, queued_media: removedMedia })
  });

  return getChatForPrivacy(companyId, chatId);
}

async function deleteClientData({ companyId, chatId, actor }) {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, company_id: companyId },
    select: { id: true, client_name: true }
  });
  if (!chat) return false;

  const [messages, schedules] = await Promise.all([
    prisma.message.findMany({ where: { chat_id: chatId }, select: { media_url: true } }),
    prisma.scheduledMessage.findMany({ where: { chat_id: chatId }, select: { media_url: true } })
  ]);
  const urls = [...messages, ...schedules].map(item => item.media_url).filter(Boolean);
  const removedMedia = urls.length;
  await prisma.$transaction(async tx => {
    await cleanup.enqueue(tx, urls);
    await tx.scheduledMessage.deleteMany({ where: { chat_id: chatId, company_id: companyId } });
    await tx.chat.deleteMany({ where: { id: chatId, company_id: companyId } });
  });

  await auditService.log({
    company_id: companyId,
    user_id: actor?.id,
    user_name: actor?.name || actor?.username,
    action: 'delete_client_data',
    entity: 'privacy',
    entity_id: chatId,
    details: JSON.stringify({ chat_id: chatId, queued_media: removedMedia })
  });

  return true;
}

module.exports = {
  exportClientData,
  anonymizeClientData,
  deleteClientData
};
