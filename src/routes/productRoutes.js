const router = require('express').Router();
const { prisma } = require('../config/database');
const auth = require('../middleware/authMiddleware');
const { scope, validate, period } = require('../services/productService');
router.use(auth, require('../middleware/planMiddleware').checkCompanyActive, (req, res, next) => ['admin', 'supervisor', 'seller'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Acesso restrito à equipe de vendas.' }));
const wrap = fn => async (req, res) => {
  try { await fn(req, res); } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    if (err.code === 'PRODUCT_LIMIT') return res.status(403).json({ error: err.message });
    if (err.code === 'P2034') return res.status(409).json({ error: 'Cadastro alterado simultaneamente. Tente novamente.' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'Chassi / IMEI já cadastrado nesta empresa.' });
    console.error('Product request failed:', err.code || err.name);
    res.status(500).json({ error: 'Não foi possível concluir a operação.' });
  }
};
router.get('/sellers', wrap(async (req, res) => {
  res.json(await prisma.user.findMany({ where: { company_id: req.user.company_id, role: 'seller' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }));
}));
router.get('/metrics', wrap(async (req, res) => {
  if (!['admin', 'supervisor'].includes(req.user.role)) return res.status(403).json({ error: 'Métricas de vendas são restritas a admin e supervisor.' });
  let dates;
  try { dates = period(req.query); } catch (err) { return res.status(400).json({ error: err.message }); }
  const groups = await prisma.product.groupBy({ by: ['seller_id'], where: { ...scope(req.user), status: 'sold', ...dates }, _count: { _all: true }, _sum: { price: true, down_payment: true } });
  const sellers = await prisma.user.findMany({ where: { company_id: req.user.company_id, role: 'seller', ...(['admin', 'supervisor'].includes(req.user.role) ? {} : { id: req.user.id }) }, select: { id: true, name: true } });
  res.json(sellers.map(seller => {
    const g = groups.find(g => g.seller_id === seller.id);
    const count = g?._count._all || 0;
    const total = Math.round(Number(g?._sum.price || 0) * 100) / 100;
    return { ...seller, count, total, down_payment: Number(g?._sum.down_payment || 0), average: count ? total / count : 0 };
  }));
}));
router.get('/', wrap(async (req, res) => {
  const products = await prisma.product.findMany({ where: scope(req.user), include: { seller: { select: { id: true, name: true } } }, orderBy: { created_at: 'desc' } });
  res.json(products.map(({ cost, supplier_name, commission_rate, ...product }) => ({ ...product, ...(['admin', 'supervisor'].includes(req.user.role) ? { cost, supplier_name, commission_rate } : {}) })));
}));
async function save(req, res) {
  let data;
  try { data = validate(req.body, req.user); } catch (err) { return res.status(400).json({ error: err.message }); }
  const commercial = require('../services/commercialService');
  if (commercial.managers(req.user)) {
    try {
      if (req.body.cost !== undefined) data.cost = req.body.cost === '' || req.body.cost === null ? null : require('../services/productService').money(req.body.cost, 'Custo');
      if (req.body.supplier_name !== undefined) data.supplier_name = commercial.text(req.body.supplier_name, 160, 'Fornecedor', true);
      if (req.body.commission_rate !== undefined) {
        data.commission_rate = require('../services/productService').money(req.body.commission_rate, 'Comissão');
        if (Number(data.commission_rate) > 100) throw commercial.fail('Comissão não pode superar 100%.');
      }
    } catch (error) { return res.status(400).json({ error: error.message }); }
  } else if (['cost', 'supplier_name', 'commission_rate'].some(key => req.body[key] !== undefined)) return res.status(403).json({ error: 'Somente gestores alteram custo, fornecedor e comissão.' });
  data.price = Number(data.price);
  const seller = await prisma.user.findFirst({ where: { id: data.seller_id, company_id: req.user.company_id, role: 'seller' }, select: { id: true } });
  if (!seller) return res.status(400).json({ error: 'Vendedor não pertence à empresa.' });
  if (req.params.id) {
    const result = await commercial.transaction(req.user, async tx => {
      const product = await tx.product.findFirst({ where: { ...scope(req.user), id: req.params.id, status: 'stock' } });
      if (!product) return { count: 0 };
      if (product.reserved_until > new Date()) throw commercial.fail('Libere a reserva antes de editar o produto.', 409);
      return tx.product.updateMany({ where: { ...scope(req.user), id: req.params.id, status: 'stock' }, data });
    });
    if (!result.count) return res.status(409).json({ error: 'Produto indisponível para edição. Vendas concluídas não podem ser alteradas.' });
    return res.json({ success: true });
  }
  const created = await prisma.$transaction(async tx => {
    const count = await tx.product.count({ where: { company_id: req.user.company_id } });
    if (count >= req.company.max_products) throw Object.assign(new Error('Limite de produtos atingido.'), { code: 'PRODUCT_LIMIT' });
    const category = await tx.category.upsert({ where: { company_id_slug: { company_id: req.user.company_id, slug: 'loja' } }, update: {}, create: { name: 'Loja', slug: 'loja', company_id: req.user.company_id } });
    return tx.product.create({ data: { ...data, company_id: req.user.company_id, slug: require('crypto').randomUUID(), category_id: category.id } });
  }, { isolationLevel: 'Serializable' });
  res.status(201).json(created);
}
router.post('/', wrap(save));
router.put('/:id', wrap(save));
router.post('/:id/sell', wrap(async (req, res) => {
  const sale = await require('../services/commercialService').sell(req.user, req.params.id, req.body);
  res.json({ success: true, sale_id: sale.id });
}));
router.post('/:id/reserve', wrap(async (req, res) => res.json(await require('../services/commercialService').reserve(req.user, req.params.id, req.body))));
router.delete('/:id/reserve', wrap(async (req, res) => { await require('../services/commercialService').release(req.user, req.params.id); res.json({ success: true }); }));
module.exports = router;
