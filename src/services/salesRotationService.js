const { prisma } = require('../config/database');

const INTEREST = 'interesse em compra';
const FORWARDED = 'encaminhados';
const ATTENDING = 'em atendimento';
const HUMAN_STAGES = [INTEREST, FORWARDED, ATTENDING];
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

  // Preserva a conexao de origem enquanto muda o responsavel.
  await require('./commercialService').syncChat(tx, { ...chat, assigned_to: seller.id }, undefined, true);
  return { assigned_to: seller.id, claimed_at: now, sales_alerted_at: null };
}

async function updateChat(id, data, companyId, actor, now = new Date(), options = {}) {
  let assignedSellerId = null;
  const result = await withCompanyLock(companyId, async tx => {
    const chat = await tx.chat.findFirst({ where: { id, company_id: companyId } });
    if (!chat) return null;
    if (actor && !isManager(actor)) {
      const { getUserInstanceIds } = require('../models/Instance');
      const userInstances = await getUserInstanceIds(actor, companyId);
      if (!require('./accessService').canSeeChat(actor, chat, userInstances)) {
        throw Object.assign(new Error('Conversa transferida para outro vendedor.'), { status: 403 });
      }
    }
    if (options.source === 'handoff' && (!chat.ai_active || chat.status === 'finalizada' || chat.is_archived || chat.is_blocked)) return null;
    if (options.source === 'handoff' && !require('./accessService').companyActive(await tx.company.findUnique({ where: { id: companyId } }), now)) return null;
    if (options.source === 'handoff' && HUMAN_STAGES.includes(chat.status) && (chat.assigned_to || chat.sales_reply_due_at)) {
      return tx.chat.findFirst({ where: { id, company_id: companyId }, include: messages });
    }
    const updates = { ...data };
    if (options.source === 'ai' && (chat.status !== 'iniciada' || updates.status !== INTEREST)) delete updates.status;
    const status = updates.status ?? chat.status;
    if (updates.status === ATTENDING || updates.status === FORWARDED) {
      const instance = await tx.instance.findFirst({ where: { id: chat.instance_id, company_id: companyId } });
      if (!instance || (status === ATTENDING) !== !!instance.user_id) {
        throw Object.assign(new Error('Em atendimento pertence a conexao do vendedor; Encaminhados pertence a conexao da loja.'), { status: 400 });
      }
      if (!chat.assigned_to && !updates.assigned_to) throw Object.assign(new Error('Defina o vendedor responsavel antes de assumir ou encaminhar.'), { status: 400 });
    }
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
    else if (entering || (options.source === 'handoff' && !chat.assigned_to)) {
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
    if (options.source === 'handoff') {
      if (!updates.sales_reply_due_at && !chat.sales_reply_due_at) updates.sales_reply_due_at = new Date(now.getTime() + REPLY_WINDOW_MS);
      const owner = updates.assigned_to !== undefined ? updates.assigned_to : chat.assigned_to;
      await tx.message.create({ data: { chat_id: id, sender: 'system', text: owner ? 'Atendimento encaminhado ao vendedor responsavel. IA permanece ativa.' : 'Atendimento na fila aguardando vendedor online. IA permanece ativa.' } });
      const context = await tx.chat.findFirst({ where: { id, company_id: companyId }, include: messages });
      const qualification = require('./leadQualificationService').previousQualification(context || chat);
      if (!qualification.context) qualification.context = (context?.messages || []).filter(message => message.sender === 'client' && !message.is_note).slice(-6).map(message => String(message.text || '').slice(0, 500)).join('\n').slice(0, 2000);
      await tx.message.create({ data: { chat_id: id, sender: 'system', is_note: true, text: 'Resumo para o vendedor:\n' + require('./leadQualificationService').sellerBrief(qualification) } });
    }
    const updated = await tx.chat.update({ where: { id }, data: updates, include: messages });
    if (updates.assigned_to !== undefined || updates.status !== undefined) {
      const origin = updates.assigned_to !== undefined ? await tx.instance.findFirst({ where: { id: chat.instance_id, company_id: companyId } }) : null;
      await require('./commercialService').syncChat(tx, updated, undefined, !!origin && !origin.user_id);
    }
    return updated;
  });

  if (assignedSellerId) {
    try {
      const { notifySeller } = require('./leadNotificationService');
      notifySeller(result, assignedSellerId).catch(() => {});
    } catch (e) {}
  }
  return result;
}

function phoneCandidates(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return [];
  return [...new Set([digits, ...(digits.startsWith('55') ? [digits.slice(2)] : digits.length <= 11 ? ['55' + digits] : [])])];
}

async function captureRelated(tx, chat, sellerId, now, reason) {
  const phones = phoneCandidates(chat.client_phone);
  if (!phones.length) return [];
  await require('./commercialService').syncChat(tx, { ...chat, assigned_to: sellerId });
  const related = await tx.chat.findMany({ where: {
    company_id: chat.company_id, client_phone: { in: phones }, assigned_to: sellerId,
    status: { in: HUMAN_STAGES }, is_archived: false, is_blocked: false
  }, include: { instance: { select: { user_id: true } }, messages: { orderBy: { timestamp: 'asc' } } } });
  const changed = [];
  for (const lead of related) {
    if (lead.claimed_at && new Date(lead.claimed_at) > now) continue;
    const status = lead.instance?.user_id ? ATTENDING : FORWARDED;
    if (!lead.sales_reply_due_at && lead.status === status) continue;
    changed.push(await tx.chat.update({ where: { id: lead.id }, data: { sales_reply_due_at: null, status }, include: messages }));
    await tx.kanbanCard.deleteMany({ where: { chat_id: lead.id, company_id: lead.company_id } });
    await tx.message.create({ data: { chat_id: lead.id, sender: 'system', text: reason } });
  }
  return changed;
}

function emitCaptured(chats) {
  for (const chat of chats) require('../config/socket').emitToCompany(chat.company_id, 'chat_updated', chat);
}

async function confirmAttendance(companyId, sellerId, chatId = null, now = new Date()) {
  const result = await withCompanyLock(companyId, async tx => {
    const seller = await tx.user.findFirst({ where: { id: sellerId, company_id: companyId, role: 'seller' } });
    if (!seller) return { status: 'unavailable', chats: [] };
    const leads = await tx.chat.findMany({ where: {
      company_id: companyId, assigned_to: sellerId, status: { in: HUMAN_STAGES },
      is_archived: false, is_blocked: false, ...(chatId ? { id: chatId } : { sales_reply_due_at: { not: null } })
    }, orderBy: { updated_at: 'desc' } });
    if (!leads.length) return { status: 'unavailable', chats: [] };
    const groups = new Set(leads.map(lead => phoneCandidates(lead.client_phone).sort().join('|') || lead.id));
    if (!chatId && groups.size > 1) return { status: 'ambiguous', chats: leads };
    const lead = leads[0];
    const captured = await captureRelated(tx, lead, sellerId, now, `Vendedor ${seller.name} confirmou atendimento via WhatsApp. Rodizio pausado em todas as conexoes deste lead.`);
    return { status: 'confirmed', chat: lead, chats: captured };
  });
  if (result.status === 'confirmed') emitCaptured(result.chats);
  return result;
}

async function recordMessage(chatId, data, now = new Date()) {
  const existing = await prisma.chat.findUnique({ where: { id: chatId }, select: { company_id: true } });
  if (!existing) throw new Error('Conversa não encontrada.');
  let captured = [];
  const message = await withCompanyLock(existing.company_id, async tx => {
    const chat = await tx.chat.findFirst({ where: { id: chatId, company_id: existing.company_id } });
    if (!chat) throw new Error('Conversa não encontrada.');
    const result = await tx.message.create({ data });
    if (!HUMAN_STAGES.includes(chat.status) || chat.is_archived || chat.is_blocked) return result;
    if (chat.status === INTEREST && data.sender === 'client' && !chat.sales_reply_due_at && !chat.assigned_to) {
      if (tx.instance) {
        const sellerChat = await tx.chat.findFirst({
          where: {
            company_id: chat.company_id,
            client_phone: chat.client_phone,
            id: { not: chatId },
            status: { in: ['iniciada', INTEREST, ATTENDING] },
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
      if (seller) captured = await captureRelated(tx, chat, seller.id, new Date(data.timestamp), 'Resposta humana recebida. Rodizio pausado em todas as conexoes deste lead.');
    }
    return result;
  });
  emitCaptured(captured);
  if (data.sender === 'client' && !data.is_note) {
    const chat = await prisma.chat.findUnique({ where: { id: chatId }, include: { instance: { select: { user_id: true } } } });
    if (chat?.instance?.user_id && !chat.is_blocked && !chat.is_archived)
      require('./pushService').send(chat.instance.user_id, chat.company_id, 'Cliente respondeu na sua conexão.', `message-${chat.id}`).catch(error => console.error('Message push failed:', error.code || error.name));
  }
  return message;
}

async function rotateExpiredChat(id, companyId, now = new Date()) {
  let assignedSellerId = null;
  const result = await withCompanyLock(companyId, async tx => {
    const chat = await tx.chat.findFirst({ where: { id, company_id: companyId } });
    if (!chat || chat.status !== INTEREST || chat.is_archived || chat.is_blocked ||
        !chat.sales_reply_due_at || new Date(chat.sales_reply_due_at) > now) return null;
    // Repair deadlines left behind by older versions after a seller-chip reply.
    if (chat.assigned_to && tx.message.findFirst && phoneCandidates(chat.client_phone).length) {
      const proof = await tx.message.findFirst({ where: {
        sender: 'attendant', sender_id: chat.assigned_to, is_ai: false, is_note: false, is_scheduled: false,
        timestamp: { gte: chat.claimed_at || chat.created_at, lte: now },
        chat: { company_id: companyId, client_phone: { in: phoneCandidates(chat.client_phone) }, assigned_to: chat.assigned_to, is_archived: false, is_blocked: false }
      } });
      if (proof) {
        await captureRelated(tx, chat, chat.assigned_to, now, 'Resposta humana ja registrada em outra conexao. Rodizio pausado.');
        return tx.chat.findFirst({ where: { id, company_id: companyId }, include: messages });
      }
    }
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

module.exports = { INTEREST, REPLY_WINDOW_MS, nextSeller, withCompanyLock, updateChat, recordMessage, rotateExpiredChat, checkSalesRotation, confirmAttendance };

async function handoffToHuman(id, companyId, now = new Date()) {
  const result = await updateChat(id, { status: INTEREST, sector: 'sales' }, companyId, null, now, { source: 'handoff' });
  if (result) require('../config/socket').emitToCompany(companyId, 'chat_updated', result);
  return result;
}
module.exports.handoffToHuman = handoffToHuman;
