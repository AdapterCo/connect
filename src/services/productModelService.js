const { prisma } = require('../config/database');
const commercial = require('./commercialService');
const products = require('./productService');
const { randomUUID } = require('crypto');

function modelData(body) {
  const name = commercial.text(body.name, 160, 'Produto');
  if (!['phone', 'motorcycle'].includes(body.kind)) throw commercial.fail('Selecione celular ou moto.');
  let price, cost, commission;
  try {
    price = products.money(body.price, 'Valor sugerido');
    cost = body.cost === '' || body.cost == null ? null : products.money(body.cost, 'Custo');
    commission = products.money(body.commission_rate ?? 0, 'Comissão');
  } catch (error) { throw commercial.fail(error.message); }
  if (Number(price) <= 0 || Number(commission) > 100) throw commercial.fail('Valor ou comissão inválidos.');
  if (body.is_active !== undefined && typeof body.is_active !== 'boolean') throw commercial.fail('Situação inválida.');
  return { name, kind: body.kind, price, cost, commission_rate: commission, is_active: body.is_active ?? true };
}
async function save(user, id, body, maxProducts) {
  if (!commercial.managers(user)) throw commercial.fail('Somente admin e supervisor cadastram produtos.', 403);
  const data = modelData(body);
  return commercial.transaction(user, async tx => {
    if (id) {
      if (!await tx.productModel.findFirst({ where: { id, company_id: user.company_id } })) throw commercial.fail('Produto não encontrado.', 404);
      return tx.productModel.update({ where: { id }, data });
    }
    if (await tx.productModel.count({ where: { company_id: user.company_id } }) >= maxProducts) throw commercial.fail('Limite de produtos atingido.', 403);
    return tx.productModel.create({ data: { ...data, company_id: user.company_id } });
  });
}
async function list(user) {
  const rows = await prisma.productModel.findMany({ where: { company_id: user.company_id, ...(!commercial.managers(user) ? { is_active: true } : {}) }, orderBy: { name: 'asc' } });
  return rows.map(({ cost, commission_rate, ...model }) => ({ ...model, ...(commercial.managers(user) ? { cost, commission_rate } : {}) }));
}
async function record(user, body) {
  return commercial.transaction(user, async tx => {
    const model = await tx.productModel.findFirst({ where: { id: commercial.text(body.model_id, 100, 'Produto'), company_id: user.company_id, is_active: true } });
    if (!model) throw commercial.fail('Produto não encontrado ou inativo.', 404);
    let data;
    try { data = products.validate({ ...body, name: model.name }, user); } catch (error) { throw commercial.fail(error.message); }
    if (model.kind === 'phone' && (!/^\d{15}$/.test(data.serial) || !data.memory)) throw commercial.fail('Celular exige IMEI com 15 dígitos e memória.');
    if (model.kind === 'motorcycle') data.memory = null;
    const seller = await tx.user.findFirst({ where: { id: data.seller_id, company_id: user.company_id, role: 'seller' } });
    if (!seller) throw commercial.fail('Vendedor não pertence à empresa.');
    const lead = await commercial.getLead(tx, user, body.opportunity_id, true);
    if (lead.seller_id && lead.seller_id !== data.seller_id) throw commercial.fail('Cliente pertence a outro vendedor.', 409);
    const category = await tx.category.upsert({ where: { company_id_slug: { company_id: user.company_id, slug: 'loja' } }, update: {}, create: { name: 'Loja', slug: 'loja', company_id: user.company_id } });
    const existing = await tx.product.findFirst({ where: { company_id: user.company_id, serial: data.serial } });
    if (existing && (existing.status !== 'stock' || (existing.model_id && existing.model_id !== model.id) || (!commercial.managers(user) && existing.seller_id !== user.id))) throw commercial.fail('Chassi / IMEI já registrado ou indisponível.', 409);
    if (existing?.reserved_until > new Date() && (existing.reserved_lead_id !== lead.id || (!commercial.managers(user) && existing.reserved_by !== user.id))) throw commercial.fail('Unidade reservada para outro atendimento.', 409);
    const unitData = { ...data, price: Number(data.price), company_id: user.company_id,
      model_id: model.id, category_id: category.id, cost: model.cost, commission_rate: model.commission_rate };
    const unit = existing ? await tx.product.update({ where: { id: existing.id }, data: unitData })
      : await tx.product.create({ data: { ...unitData, slug: randomUUID() } });
    // The unit and sale commit together; failures leave no orphan stock item.
    return commercial.sell(user, unit.id, body, new Date(), tx);
  });
}
module.exports = { modelData, save, list, record };
