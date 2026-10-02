const { prisma } = require('../config/database');

const INTEREST = 'interesse em compra';
const REPLY_WINDOW_MS = 60 * 1000;
const messages = { messages: { orderBy: { timestamp: 'asc' } } };
const isManager = user => ['admin', 'supervisor'].includes(user.role);

// All routing mutations take the same database lock, including manual moves,
// incoming messages and successful seller replies. This also serializes workers.
async function withCompanyLock(companyId, work) {
  return prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${companyId} FOR UPDATE`;
    if (!rows.length) throw new Error('Empresa não encontrada.');
    return work(tx);
  });
}

function nextSeller(sellers, cursor, currentId = null) {
  if (!sellers.length) return null;
  const index = sellers.findIndex(seller => seller.id === cursor);
  for (let offset = 1; offset <= sellers.length; offset++) {
    const candidate = sellers[(index + offset) % sellers.length];
    if (candidate.id !== currentId) return candidate;
  }
  return null;
}

async function assignNext(tx, chat, now, initial = false) {
  const company = await tx.company.findUnique({ where: { id: chat.company_id } });
  if (!company?.is_active || (company.expires_at && new Date(company.expires_at) <= now)) return null;
  const sellers = await tx.user.findMany({
    where: { company_id: chat.company_id, role: 'seller', status: 'online' },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true, phone: true }
  });
  // On timeout, advance from the current seller; new leads use the company cursor.
  const seller = nextSeller(sellers, initial ? company.sales_rotation_cursor : chat.assigned_to, initial ? null : chat.assigned_to);
  if (!seller) return null;
  await tx.company.update({ where: { id: chat.company_id }, data: { sales_rotation_cursor: seller.id } });
  await tx.auditLog.create({ data: {
    company_id: chat.company_id, action: initial ? 'sales_rotation_assign' : 'sales_rotation_timeout',
    entity: 'chat', entity_id: chat.id,
    details: JSON.stringify({ previous_seller: chat.assigned_to, seller_id: seller.id, deadline_seconds: 60 })
  } });

  let targetInstanceId = chat.instance_id;
  try {
    const { getUserInstanceIds } = require('../models/Instance');
    const userInstances = await getUserInstanceIds(seller, chat.company_id);
    if (userInstances && userInstances.length > 0) {
      targetInstanceId = userInstances[0];
    }
  } catch {}

  return { assigned_to: seller.id, claimed_at: now, ...(targetInstanceId ? { instance_id: targetInstanceId } : {}) };
}

async function updateChat(id, data, companyId, actor, now = new Date(), options = {}) {
  let assignedSellerId = null;
  const result = await withCompanyLock(companyId, async tx => {
    const chat = await tx.chat.findFirst({ where: { id, company_id: companyId } });
    if (!chat) return null;
    if (actor && !isManager(actor) && chat.assigned_to !== actor.id) {
      const { getUserInstanceIds } = require('../models/Instance');
      const userInstances = await getUserInstanceIds(actor, companyId);
      if (!userInstances.includes(chat.instance_id)) {
        throw Object.assign(new Error('Conversa transferida para outro vendedor.'), { status: 403 });
      }
    }
    const updates = { ...data };
    if (options.source === 'ai' && (chat.status !== 'iniciada' || updates.status !== INTEREST)) delete updates.status;
    const status = updates.status ?? chat.status;
    const inactive = (data.is_archived ?? chat.is_archived) || (data.is_blocked ?? chat.is_blocked);
    const entering = status === INTEREST && chat.status !== INTEREST;
    const reassigned = data.assigned_to !== undefined && data.assigned_to !== chat.assigned_to;
    if (status === 'finalizada' && chat.status !== 'finalizada' && chat.claimed_at) {
      await tx.metric.create({ data: {
        type: 'attendance_time', chat_id: chat.id, attendant_id: chat.assigned_to,
        is_ai: false, company_id: companyId, timestamp: now,
        duration_seconds: Math.max(0, Math.round((now - new Date(chat.claimed_at)) / 1000))
      } });
      updates.claimed_at = null;
    }
    if (status !== INTEREST || inactive) updates.sales_reply_due_at = null;
    else if (entering) {
      Object.assign(updates, await assignNext(tx, chat, now, true) || { assigned_to: null, claimed_at: null });
      updates.sales_reply_due_at = new Date(now.getTime() + REPLY_WINDOW_MS);
    } else if (reassigned || (chat.is_archived && data.is_archived === false) || (chat.is_blocked && data.is_blocked === false)) {
      updates.sales_reply_due_at = new Date(now.getTime() + REPLY_WINDOW_MS);
    }
    if (updates.assigned_to && updates.assigned_to !== chat.assigned_to) {
      assignedSellerId = updates.assigned_to;
    }
    if (status !== chat.status || (updates.assigned_to !== undefined && updates.assigned_to !== chat.assigned_to)) {
      await tx.kanbanCard.deleteMany({ where: { chat_id: id, company_id: companyId } });
    }
    return tx.chat.update({ where: { id }, data: updates, include: messages });
  });

  if (assignedSellerId) {
    try {
      const { notifySeller } = require('./leadNotificationService');
      notifySeller(result, assignedSellerId).catch(() => {});
    } catch (e) {}
  }
  return result;
}

async function recordMessage(chatId, data, now = new Date()) {
  const existing = await prisma.chat.findUnique({ where: { id: chatId }, select: { company_id: true } });
  if (!existing) throw new Error('Conversa não encontrada.');
  return withCompanyLock(existing.company_id, async tx => {
    const chat = await tx.chat.findFirst({ where: { id: chatId, company_id: existing.company_id } });
    if (!chat) throw new Error('Conversa não encontrada.');
    const result = await tx.message.create({ data });
    if (chat.status !== INTEREST || chat.is_archived || chat.is_blocked) return result;
    if (data.sender === 'client' && !chat.sales_reply_due_at) {
      if (tx.instance) {
        const sellerChat = await tx.chat.findFirst({
          where: {
            company_id: chat.company_id,
            client_phone: chat.client_phone,
            id: { not: chatId },
            status: { in: ['iniciada', INTEREST] },
            instance: { user_id: { not: null } }
          }
        });
        if (sellerChat) {
          return result;
        }
      }
      const assignment = !chat.assigned_to ? await assignNext(tx, chat, now, true) : null;
      await tx.chat.update({ where: { id: chatId }, data: {
        ...(assignment || {}), sales_reply_due_at: new Date(now.getTime() + REPLY_WINDOW_MS)
      } });
    } else if (data.sender === 'attendant' && !data.is_ai && !data.is_note && !data.is_scheduled &&
        data.sender_id && data.sender_id === chat.assigned_to &&
        (!chat.claimed_at || new Date(data.timestamp) >= new Date(chat.claimed_at))) {
      const seller = await tx.user.findFirst({ where: { id: data.sender_id, company_id: chat.company_id, role: 'seller' }, select: { id: true } });
      if (seller) await tx.chat.update({ where: { id: chatId }, data: { sales_reply_due_at: null } });
    }
    return result;
  });
}

async function rotateExpiredChat(id, companyId, now = new Date()) {
  let assignedSellerId = null;
  const result = await withCompanyLock(companyId, async tx => {
    const chat = await tx.chat.findFirst({ where: { id, company_id: companyId } });
    if (!chat || chat.status !== INTEREST || chat.is_archived || chat.is_blocked ||
        !chat.sales_reply_due_at || new Date(chat.sales_reply_due_at) > now) return null;
    const assignment = await assignNext(tx, chat, now, !chat.assigned_to);
    if (assignment) {
      assignedSellerId = assignment.assigned_to;
      await tx.kanbanCard.deleteMany({ where: { chat_id: id, company_id: companyId } });
    }
    return tx.chat.update({ where: { id }, data: {
      ...(assignment || {}), sales_reply_due_at: new Date(now.getTime() + REPLY_WINDOW_MS)
    }, include: messages });
  });

  if (assignedSellerId) {
    try {
      const { notifySeller } = require('./leadNotificationService');
      notifySeller(result, assignedSellerId).catch(() => {});
    } catch (e) {}
  }
  return result;
}

async function checkSalesRotation(now = new Date()) {
  const due = await prisma.chat.findMany({
    where: { status: INTEREST, is_archived: false, is_blocked: false, sales_reply_due_at: { lte: now } },
    select: { id: true, company_id: true }, orderBy: { sales_reply_due_at: 'asc' }, take: 100
  });
  for (const chat of due) {
    try {
      const updated = await rotateExpiredChat(chat.id, chat.company_id, now);
      if (updated) require('../config/socket').emitToCompany(chat.company_id, 'chat_updated', updated);
    } catch (error) { console.error('Sales rotation failed:', error.code || error.name); }
  }
}

module.exports = { INTEREST, REPLY_WINDOW_MS, nextSeller, withCompanyLock, updateChat, recordMessage, rotateExpiredChat, checkSalesRotation };
