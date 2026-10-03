const router = require('express').Router();
const { prisma } = require('../config/database');
const service = require('../services/commercialService');
router.use(require('../middleware/authMiddleware'), require('../middleware/planMiddleware').checkCompanyActive,
  (req, res, next) => ['admin', 'supervisor', 'seller'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Acesso restrito à equipe comercial.' }));
const wrap = fn => async (req, res) => {
  try { await fn(req, res); } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (['P2002', 'P2034'].includes(error.code)) return res.status(409).json({ error: 'Registro alterado simultaneamente. Atualize e tente novamente.' });
    console.error('Commercial operation failed:', error.code || error.name);
    res.status(500).json({ error: 'Não foi possível concluir a operação.' });
  }
};
router.get('/leads', wrap(async (req, res) => {
  await service.ensureChats(req.user);
  res.json(await prisma.opportunity.findMany({ where: service.scope(req.user), orderBy: { updated_at: 'desc' }, take: 200 }));
}));
router.get('/summary', wrap(async (req, res) => {
  if (!service.managers(req.user)) throw service.fail('Indicadores comerciais são restritos a admin e supervisor.', 403);
  const where = service.scope(req.user);
  const [total, open, lost, converted] = await Promise.all([
    prisma.opportunity.count({ where }), prisma.opportunity.count({ where: { ...where, status: 'open' } }),
    prisma.opportunity.count({ where: { ...where, status: 'lost' } }),
    prisma.opportunity.count({ where: { ...where, sales: { some: { status: 'sold', ...(!service.managers(req.user) ? { seller_id: req.user.id } : {}) } } } })
  ]);
  res.json({ total, open, lost, converted, conversion_rate: total ? Math.round(converted / total * 10000) / 100 : 0 });
}));
router.post('/leads', wrap(async (req, res) => res.status(201).json(await service.createLead(req.user, req.body))));
router.patch('/leads/:id', wrap(async (req, res) => {
  const lead = await service.updateLead(req.user, req.params.id, req.body);
  const chats = await prisma.chat.findMany({ where: { company_id: req.user.company_id, opportunity_id: lead.id }, include: { messages: { orderBy: { timestamp: 'desc' }, take: 50 } } });
  for (const chat of chats) require('../config/socket').emitToCompany(req.user.company_id, 'chat_updated', { ...chat, messages: [...chat.messages].reverse() });
  if (req.body.seller_id) {
    const shop = chats.find(chat => chat.status === 'interesse em compra' && chat.sales_reply_due_at);
    if (shop) require('../services/leadNotificationService').notifySeller(shop, lead.seller_id).catch(() => {});
  }
  res.json(lead);
}));
router.get('/leads/:id/chats', wrap(async (req, res) => {
  await service.getLead(prisma, req.user, req.params.id);
  res.json(await prisma.chat.findMany({ where: { ...await require('../services/accessService').chatScope(req.user), opportunity_id: req.params.id },
    select: { id: true, client_name: true, status: true, instance: { select: { name: true } } } }));
}));
router.get('/tasks', wrap(async (req, res) => {
  res.json(await prisma.followUpTask.findMany({ where: { company_id: req.user.company_id,
    ...(!service.managers(req.user) ? { owner_id: req.user.id, opportunity: service.scope(req.user) } : {}) },
    include: { opportunity: { select: { client_name: true } } }, orderBy: { due_at: 'asc' }, take: 200 }));
}));
router.post('/tasks', wrap(async (req, res) => {
  const title = service.text(req.body.title, 160, 'Título'), due = service.date(req.body.due_at, false);
  if (due <= new Date()) throw service.fail('Escolha uma data futura.');
  const task = await service.transaction(req.user, async tx => {
    const lead = await service.getLead(tx, req.user, req.body.opportunity_id, true);
    const ownerId = service.managers(req.user) ? (lead.seller_id || req.user.id) : req.user.id;
    const owner = await tx.user.findFirst({ where: { id: ownerId, company_id: req.user.company_id, role: { in: ['seller', 'admin', 'supervisor'] } } });
    if (!owner) throw service.fail('Responsável indisponível.');
    const count = await tx.followUpTask.count({ where: { company_id: req.user.company_id, completed_at: null } });
    if (count >= 5000) throw service.fail('Limite de tarefas abertas atingido.', 409);
    const created = await tx.followUpTask.create({ data: { company_id: req.user.company_id, opportunity_id: lead.id, owner_id: owner.id, title, due_at: due } });
    await service.audit(tx, req.user, 'task_created', 'task', created.id);
    return created;
  });
  res.status(201).json(task);
}));
router.patch('/tasks/:id/complete', wrap(async (req, res) => {
  const task = await service.transaction(req.user, async tx => {
    const item = await tx.followUpTask.findFirst({ where: { id: req.params.id, company_id: req.user.company_id,
      ...(!service.managers(req.user) ? { owner_id: req.user.id, opportunity: service.scope(req.user) } : {}) } });
    if (!item) throw service.fail('Tarefa indisponível.', 404);
    const result = await tx.followUpTask.update({ where: { id: item.id }, data: { completed_at: item.completed_at || new Date() } });
    await service.audit(tx, req.user, 'task_completed', 'task', item.id);
    return result;
  });
  res.json(task);
}));
router.get('/replies', wrap(async (req, res) => res.json(await prisma.cannedReply.findMany({ where: { company_id: req.user.company_id }, orderBy: { title: 'asc' } }))));
router.post('/replies', wrap(async (req, res) => {
  if (!service.managers(req.user)) throw service.fail('Somente gestores alteram a biblioteca.', 403);
  const title = service.text(req.body.title, 100, 'Título'), text = service.text(req.body.text, 4000, 'Texto');
  const reply = await service.transaction(req.user, async tx => {
    if (await tx.cannedReply.count({ where: { company_id: req.user.company_id } }) >= 200) throw service.fail('Limite de 200 respostas compartilhadas atingido.', 409);
    const result = await tx.cannedReply.create({ data: { company_id: req.user.company_id, title, text } });
    await service.audit(tx, req.user, 'reply_created', 'canned_reply', result.id);
    return result;
  });
  res.status(201).json(reply);
}));
router.put('/replies/:id', wrap(async (req, res) => {
  if (!service.managers(req.user)) throw service.fail('Somente gestores alteram a biblioteca.', 403);
  const title = service.text(req.body.title, 100, 'Título'), text = service.text(req.body.text, 4000, 'Texto');
  await service.transaction(req.user, async tx => {
    const result = await tx.cannedReply.updateMany({ where: { id: req.params.id, company_id: req.user.company_id }, data: { title, text } });
    if (!result.count) throw service.fail('Resposta indisponível.', 404);
    await service.audit(tx, req.user, 'reply_updated', 'canned_reply', req.params.id);
  });
  res.json({ success: true });
}));
router.delete('/replies/:id', wrap(async (req, res) => {
  if (!service.managers(req.user)) throw service.fail('Somente gestores alteram a biblioteca.', 403);
  await service.transaction(req.user, async tx => {
    await tx.cannedReply.deleteMany({ where: { id: req.params.id, company_id: req.user.company_id } });
    await service.audit(tx, req.user, 'reply_deleted', 'canned_reply', req.params.id);
  });
  res.json({ success: true });
}));
const saleInclude = { product: { select: { id: true, name: true, serial: true } }, opportunity: { select: { client_name: true, phone: true } },
  receipts: { orderBy: { created_at: 'asc' } }, after_sales: { orderBy: { created_at: 'desc' } } };
// Operational post-sale data does not include financial values or metrics.
router.get('/sales/operations', wrap(async (req, res) => {
  res.json(await prisma.sale.findMany({ where: service.scope(req.user), orderBy: { created_at: 'desc' }, take: 200,
    select: { id: true, created_at: true, status: true, warranty_until: true,
      product: { select: { id: true, name: true, serial: true } },
      opportunity: { select: { client_name: true, phone: true } },
      after_sales: { orderBy: { created_at: 'desc' } }
    } }));
}));
router.get('/sales', wrap(async (req, res) => {
  if (!service.managers(req.user)) throw service.fail('Dados financeiros são restritos a admin e supervisor.', 403);
  const dates = require('../services/productService').period(req.query).sold_at;
  const sales = await prisma.sale.findMany({ where: { ...service.scope(req.user), ...(dates ? { created_at: dates } : {}) }, include: saleInclude, orderBy: { created_at: 'desc' }, take: 200 });
  res.json(sales.map(sale => {
    const { cost, ...safe } = sale;
    return { ...safe, ...(service.managers(req.user) ? { cost } : {}), ...service.financials(sale, service.managers(req.user)) };
  }));
}));
router.post('/sales/:id/receipts', wrap(async (req, res) => res.status(201).json(await service.receipt(req.user, req.params.id, req.body))));
router.post('/sales/:id/after-sales', wrap(async (req, res) => res.status(201).json(await service.afterSale(req.user, req.params.id, req.body))));
router.patch('/after-sales/:id/resolve', wrap(async (req, res) => res.json(await service.resolveAfterSale(req.user, req.params.id, req.body))));
module.exports = router;
