const { prisma } = require('../config/database');
const { money } = require('./productService');
const managers = user => ['admin', 'supervisor'].includes(user?.role);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const scope = user => {
  if (!user?.company_id || !user.id) throw fail('Usuário sem empresa.', 403);
  return { company_id: user.company_id, ...(!managers(user) ? { seller_id: user.id } : {}) };
};

function phoneKey(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
  return /^\d{10,15}$/.test(digits) ? digits : null;
}
function text(value, max, label, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw fail(`${label} inválido.`);
  return value.trim();
}
function date(value, optional = true) {
  if (!value && optional) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw fail('Data inválida.');
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (year < 2000 || year > 2100 || new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== value.slice(0, 10) || Number(value.slice(11, 13)) > 23) throw fail('Data inválida.');
  return new Date(value);
}
function cents(value) {
  let validated;
  try { validated = money(value, 'Valor'); } catch (error) { throw fail(error.message); }
  const [units, fraction = ''] = validated.split('.');
  return Number(units) * 100 + Number(fraction.padEnd(2, '0'));
}
const amount = value => (value / 100).toFixed(2);
const pref = value => typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : null;

async function audit(tx, user, action, entity, id, details = {}) {
  await tx.auditLog.create({ data: { company_id: user.company_id, user_id: user.id, user_name: user.name,
    action, entity, entity_id: id, details: JSON.stringify(details) } });
}
async function lock(tx, companyId) {
  await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${companyId} FOR UPDATE`;
}
async function transaction(user, work) {
  return prisma.$transaction(async tx => { await lock(tx, user.company_id); return work(tx); });
}

// Explicit allowlist: context, messages, internal notes and raw model output cannot enter this record.
async function syncChat(tx, chat, qualification, authoritativeAssignment = false) {
  if (chat.remote_jid?.endsWith('@lid') && String(chat.client_phone || '').replace(/\D/g, '') === chat.remote_jid.split('@')[0]) return null;
  const phone = phoneKey(chat.client_phone);
  if (!phone) return null;
  const existing = await tx.opportunity.findUnique({ where: { company_id_phone: { company_id: chat.company_id, phone } } });
  const prefs = qualification ? {
    product: pref(qualification.product), variant: pref(qualification.variant),
    payment: pref(qualification.payment), purchase_confirmed: qualification.purchase_confirmed === true
  } : {};
  const canAssign = authoritativeAssignment || !existing?.seller_id || existing.seller_id === chat.assigned_to;
  const changes = { ...prefs, ...(chat.assigned_to && canAssign ? { seller_id: chat.assigned_to } : {}),
    ...(existing?.status === 'lost' && qualification?.purchase_confirmed === true ? { status: 'open', lost_reason: null } : {}) };
  const lead = existing
    ? await tx.opportunity.update({ where: { id: existing.id }, data: changes })
    : await tx.opportunity.create({ data: { company_id: chat.company_id, phone, client_name: String(chat.client_name || 'Cliente').slice(0, 160), ...changes } });
  if (chat.assigned_to && canAssign && existing?.seller_id && existing.seller_id !== chat.assigned_to)
    await tx.followUpTask.updateMany({ where: { company_id: chat.company_id, opportunity_id: lead.id, completed_at: null }, data: { owner_id: chat.assigned_to, reminded_at: null } });
  await tx.chat.updateMany({ where: { id: chat.id, company_id: chat.company_id }, data: { opportunity_id: lead.id } });
  return lead;
}
async function ensureChats(user) {
  const chatWhere = await require('./accessService').chatScope(user);
  // Bounded backfill on demand: one opportunity per canonical phone; no messages exposed in the API.
  const chats = await prisma.chat.findMany({ where: { ...chatWhere, opportunity_id: null, is_blocked: false }, take: 100,
    orderBy: { updated_at: 'desc' }, include: { instance: { select: { user_id: true } }, messages: { where: { sender: 'system', is_note: true }, orderBy: { timestamp: 'desc' }, take: 30 } } });
  if (!chats.length) return;
  await transaction(user, async tx => {
    for (const chat of chats) {
      const old = await tx.opportunity.findUnique({ where: { company_id_phone: { company_id: user.company_id, phone: phoneKey(chat.client_phone) || '' } } });
      // Old private chats cannot overwrite a newer shop preference or rotation owner.
      await syncChat(tx, { ...chat, assigned_to: old?.seller_id || chat.assigned_to || chat.instance?.user_id }, old ? undefined : require('./leadQualificationService').previousQualification({ ...chat, messages: [...chat.messages].reverse() }));
    }
  });
}
async function getLead(tx, user, id, open = false) {
  id = text(id, 100, 'Lead');
  const lead = await tx.opportunity.findFirst({ where: { ...scope(user), id } });
  if (!lead) throw fail('Lead indisponível.', 404);
  if (open && lead.status !== 'open') throw fail('Reabra o lead antes desta operação.', 409);
  return lead;
}
async function createLead(user, body) {
  const phone = phoneKey(body.phone);
  if (!phone) throw fail('Telefone inválido.');
  const name = text(body.client_name, 160, 'Nome');
  return transaction(user, async tx => {
    const existing = await tx.opportunity.findUnique({ where: { company_id_phone: { company_id: user.company_id, phone } } });
    if (existing) {
      await getLead(tx, user, existing.id);
      return existing;
    }
    const lead = await tx.opportunity.create({ data: { company_id: user.company_id, client_name: name, phone, seller_id: managers(user) ? null : user.id } });
    await audit(tx, user, 'lead_created', 'opportunity', lead.id);
    return lead;
  });
}
async function updateLead(user, id, body) {
  return transaction(user, async tx => {
    await getLead(tx, user, id);
    const data = {};
    for (const key of ['product', 'variant', 'payment']) if (body[key] !== undefined) data[key] = text(body[key], 160, key, true);
    if (data.payment && !['Pix', 'Dinheiro', 'Cartao', 'Boleto'].includes(data.payment)) throw fail('Pagamento inválido.');
    if (body.status !== undefined) {
      if (!['open', 'lost'].includes(body.status)) throw fail('Venda concluída é registrada em Produtos e vendas.');
      const activeSales = await tx.sale.count({ where: { company_id: user.company_id, opportunity_id: id, status: 'sold' } });
      if (body.status === 'lost' && activeSales) throw fail('Lead com venda ativa não pode ser marcado perdido.', 409);
      data.status = body.status;
      data.lost_reason = body.status === 'lost' ? text(body.lost_reason, 500, 'Motivo da perda') : null;
      if (body.status === 'lost') data.purchase_confirmed = false;
      if (body.status === 'lost') await tx.product.updateMany({ where: { company_id: user.company_id, reserved_lead_id: id }, data: { reserved_lead_id: null, reserved_by: null, reserved_until: null } });
      if (body.status === 'lost') {
        await tx.chat.updateMany({ where: { company_id: user.company_id, opportunity_id: id, status: 'interesse em compra' }, data: { status: 'iniciada', sales_reply_due_at: null, claimed_at: null } });
        await tx.followUpTask.updateMany({ where: { company_id: user.company_id, opportunity_id: id, completed_at: null }, data: { completed_at: new Date() } });
      }
    }
    if (body.seller_id !== undefined) {
      if (!managers(user)) throw fail('Somente gestores podem atribuir leads.', 403);
      const seller = await tx.user.findFirst({ where: { id: body.seller_id, company_id: user.company_id, role: 'seller' } });
      if (!seller) throw fail('Vendedor inválido.');
      data.seller_id = seller.id;
      await tx.followUpTask.updateMany({ where: { company_id: user.company_id, opportunity_id: id, completed_at: null }, data: { owner_id: seller.id, reminded_at: null } });
      await tx.product.updateMany({ where: { company_id: user.company_id, reserved_lead_id: id }, data: { reserved_by: null, reserved_lead_id: null, reserved_until: null } });
      const now = new Date();
      await tx.chat.updateMany({ where: { company_id: user.company_id, opportunity_id: id, status: 'interesse em compra', instance: { user_id: null }, is_archived: false, is_blocked: false },
        data: { assigned_to: seller.id, claimed_at: now, sales_reply_due_at: new Date(now.getTime() + 60000), sales_alerted_at: null } });
    }
    const result = await tx.opportunity.update({ where: { id }, data });
    await audit(tx, user, 'lead_updated', 'opportunity', id, { fields: Object.keys(data) });
    return result;
  });
}

async function reserve(user, productId, body, now = new Date()) {
  const minutes = Number(body.minutes ?? 30);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 120) throw fail('Reserva deve durar de 5 a 120 minutos.');
  return transaction(user, async tx => {
    const lead = await getLead(tx, user, body.opportunity_id, true);
    const product = await tx.product.findFirst({ where: { ...require('./productService').scope(user), id: productId, status: 'stock', is_active: true } });
    if (!product) throw fail('Produto indisponível.', 404);
    if (!managers(user) && lead.seller_id !== product.seller_id) throw fail('Lead e produto devem pertencer ao mesmo vendedor.', 403);
    if (product.reserved_until && new Date(product.reserved_until) > now && (product.reserved_by !== user.id || product.reserved_lead_id !== lead.id)) throw fail('Aparelho já reservado.', 409);
    const result = await tx.product.update({ where: { id: productId }, data: { reserved_by: user.id, reserved_lead_id: lead.id, reserved_until: new Date(now.getTime() + minutes * 60000) } });
    await audit(tx, user, 'product_reserved', 'product', productId, { opportunity_id: lead.id, minutes });
    return { reserved_until: result.reserved_until };
  });
}
async function release(user, productId) {
  return transaction(user, async tx => {
    const product = await tx.product.findFirst({ where: { ...require('./productService').scope(user), id: productId } });
    if (!product) throw fail('Produto indisponível.', 404);
    if (product.reserved_by && product.reserved_by !== user.id && !managers(user)) throw fail('Reserva pertence a outro usuário.', 403);
    await tx.product.update({ where: { id: productId }, data: { reserved_by: null, reserved_until: null, reserved_lead_id: null } });
    await audit(tx, user, 'reservation_released', 'product', productId);
  });
}
async function sell(user, productId, body, now = new Date()) {
  const due = date(body.due_at), warranty = date(body.warranty_until);
  if (warranty && warranty < now) throw fail('Garantia não pode terminar no passado.');
  return transaction(user, async tx => {
    const product = await tx.product.findFirst({ where: { ...require('./productService').scope(user), id: productId, status: 'stock' } });
    if (!product || !product.seller_id || !product.serial || !['pix', 'cash', 'card', 'boleto'].includes(product.payment_method) || !Number.isFinite(product.price) || product.price <= 0) throw fail('Produto vendido ou cadastro incompleto.', 409);
    const leadId = body.opportunity_id || (product.reserved_until > now ? product.reserved_lead_id : null);
    if (!leadId) throw fail('Vincule a venda a um cliente antes de confirmar.');
    const lead = await getLead(tx, user, leadId, true);
    if (!phoneKey(lead.phone) || !lead.client_name?.trim()) throw fail('Cliente sem nome ou telefone válido. Complete o cadastro.');
    if (lead && lead.seller_id && lead.seller_id !== product.seller_id) throw fail('Lead e produto pertencem a vendedores diferentes.', 409);
    if (product.reserved_until > now && (product.reserved_lead_id !== leadId || (!managers(user) && product.reserved_by !== user.id))) throw fail('Venda não corresponde à reserva ativa.', 409);
    const sale = await tx.sale.create({ data: { company_id: user.company_id, product_id: product.id, opportunity_id: lead.id,
      seller_id: product.seller_id, total: product.price.toFixed(2), cost: product.cost, commission_rate: product.commission_rate,
      payment_method: product.payment_method, due_at: due, warranty_until: warranty, created_at: now } });
    await tx.product.update({ where: { id: product.id }, data: { status: 'sold', sold_at: now, is_active: false, reserved_by: null, reserved_until: null, reserved_lead_id: null } });
    if (lead) {
      await tx.opportunity.update({ where: { id: lead.id }, data: { status: 'won', seller_id: product.seller_id, lost_reason: null } });
      await tx.followUpTask.updateMany({ where: { company_id: user.company_id, opportunity_id: lead.id, completed_at: null }, data: { completed_at: now } });
    }
    await audit(tx, user, 'sale_created', 'sale', sale.id, { product_id: product.id, opportunity_id: lead?.id || null });
    return sale;
  });
}
function financials(sale, manager = false) {
  const total = Math.round(Number(sale.total) * 100);
  const received = (sale.receipts || []).reduce((sum, receipt) => sum + (receipt.kind === 'refund' ? -1 : 1) * Math.round(Number(receipt.amount) * 100), 0);
  const valid = sale.status === 'sold';
  const commission = valid ? Math.round(total * Number(sale.commission_rate) / 100) : 0;
  return { received: received / 100, balance: valid ? Math.max(0, total - received) / 100 : 0,
    refund_due: valid ? 0 : Math.max(0, received) / 100,
    commission: commission / 100, commission_earned: valid ? Math.round(commission * Math.max(0, Math.min(received, total)) / total) / 100 : 0,
    ...(manager ? { margin: valid && sale.cost != null ? (total - Math.round(Number(sale.cost) * 100) - commission) / 100 : null } : {}) };
}
async function receipt(user, id, body) {
  if (!managers(user)) throw fail('Somente gestores registram recebimentos e estornos.', 403);
  const value = cents(body.amount);
  if (value <= 0) throw fail('Valor deve ser maior que zero.');
  if (!['payment', 'refund'].includes(body.kind) || !['cash', 'pix', 'card', 'boleto'].includes(body.method)) throw fail('Tipo ou forma inválida.');
  const request = text(body.request_id, 100, 'Identificador');
  const reference = text(body.reference, 160, 'Referência', true);
  return transaction(user, async tx => {
    const sale = await tx.sale.findFirst({ where: { ...scope(user), id }, include: { receipts: true } });
    if (!sale) throw fail('Venda indisponível.', 404);
    const prior = await tx.saleReceipt.findUnique({ where: { request_id: request } });
    if (prior) {
      if (prior.company_id !== user.company_id || prior.sale_id !== id || Math.round(Number(prior.amount) * 100) !== value || prior.kind !== body.kind || prior.method !== body.method || prior.reference !== reference) throw fail('Identificador já utilizado.', 409);
      return prior;
    }
    const f = financials(sale);
    if (body.kind === 'payment' && (sale.status !== 'sold' || value > Math.round(f.balance * 100))) throw fail('Recebimento supera o saldo ou venda foi devolvida.', 409);
    if (body.kind === 'refund' && value > Math.round(f.received * 100)) throw fail('Estorno supera o valor recebido.', 409);
    const result = await tx.saleReceipt.create({ data: { company_id: user.company_id, sale_id: id, created_by: user.id, amount: amount(value), kind: body.kind, method: body.method, reference, request_id: request } });
    await audit(tx, user, 'sale_receipt', 'sale', id, { kind: body.kind, amount: amount(value) });
    return result;
  });
}
async function afterSale(user, saleId, body) {
  const description = text(body.description, 2000, 'Descrição');
  if (!['warranty', 'return', 'support'].includes(body.type)) throw fail('Tipo inválido.');
  return transaction(user, async tx => {
    const sale = await tx.sale.findFirst({ where: { ...scope(user), id: saleId } });
    if (!sale) throw fail('Venda indisponível.', 404);
    const result = await tx.afterSale.create({ data: { company_id: user.company_id, sale_id: sale.id, created_by: user.id, type: body.type, description } });
    await audit(tx, user, 'after_sale_created', 'after_sale', result.id);
    return result;
  });
}
async function resolveAfterSale(user, id, body) {
  const resolution = text(body.resolution, 2000, 'Resolução');
  return transaction(user, async tx => {
    const item = await tx.afterSale.findFirst({ where: { id, company_id: user.company_id, sale: scope(user) }, include: { sale: true } });
    if (!item) throw fail('Solicitação indisponível.', 404);
    if (item.status !== 'open') throw fail('Solicitação já encerrada.', 409);
    if (body.approve_return === true) {
      if (!managers(user)) throw fail('Somente gestores aprovam devoluções.', 403);
      if (item.type !== 'return' || item.sale.status !== 'sold') throw fail('Devolução inválida.', 409);
      await tx.sale.update({ where: { id: item.sale_id }, data: { status: 'returned' } });
      await tx.product.update({ where: { id: item.sale.product_id }, data: { status: 'returned', is_active: false } });
      if (item.sale.opportunity_id && !await tx.sale.count({ where: { company_id: user.company_id, opportunity_id: item.sale.opportunity_id, status: 'sold', id: { not: item.sale_id } } }))
        await tx.opportunity.update({ where: { id: item.sale.opportunity_id }, data: { status: 'open' } });
    }
    const result = await tx.afterSale.update({ where: { id }, data: { status: body.approve_return ? 'returned' : 'resolved', resolution, resolved_at: new Date() } });
    await audit(tx, user, 'after_sale_resolved', 'after_sale', id, { returned: body.approve_return === true });
    return result;
  });
}
module.exports = { scope, managers, phoneKey, text, date, cents, amount, fail, audit, lock, transaction, syncChat, ensureChats, getLead,
  createLead, updateLead, reserve, release, sell, financials, receipt, afterSale, resolveAfterSale };
