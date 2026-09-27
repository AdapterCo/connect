const router = require('express').Router();
const { prisma } = require('../config/database');
const auth = require('../middleware/authMiddleware');
const { scope, validate, period } = require('../services/productService');
router.use(auth, (req, res, next) => ['admin', 'supervisor', 'seller'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Acesso restrito à equipe de vendas.' }));
const wrap = fn => async (req, res) => {
  try { await fn(req, res); } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Chassi / IMEI já cadastrado nesta empresa.' });
    console.error('Product request failed:', err.code || err.name);
    res.status(500).json({ error: 'Não foi possível concluir a operação.' });
  }
};
router.get('/sellers', wrap(async (req, res) => {
  res.json(await prisma.user.findMany({ where: { company_id: req.user.company_id, role: 'seller' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }));
}));
router.get('/metrics', wrap(async (req, res) => {
  let dates;
  try { dates = period(req.query); } catch (err) { return res.status(400).json({ error: err.message }); }
  const groups = await prisma.product.groupBy({ by: ['seller_id'], where: { ...scope(req.user), status: 'sold', ...dates }, _count: { _all: true }, _sum: { price: true, down_payment: true } });
  const sellers = await prisma.user.findMany({ where: { company_id: req.user.company_id, role: 'seller', ...(['admin', 'supervisor'].includes(req.user.role) ? {} : { id: req.user.id }) }, select: { id: true, name: true } });
  res.json(sellers.map(seller => {
    const g = groups.find(g => g.seller_id === seller.id);
    const count = g?._count._all || 0;
    const total = Number(g?._sum.price || 0);
    return { ...seller, count, total, down_payment: Number(g?._sum.down_payment || 0), average: count ? total / count : 0 };
  }));
}));
router.get('/', wrap(async (req, res) => {
  res.json(await prisma.product.findMany({ where: scope(req.user), include: { seller: { select: { id: true, name: true } } }, orderBy: { created_at: 'desc' } }));
}));
async function save(req, res) {
  let data;
  try { data = validate(req.body, req.user); } catch (err) { return res.status(400).json({ error: err.message }); }
  const seller = await prisma.user.findFirst({ where: { id: data.seller_id, company_id: req.user.company_id, role: 'seller' }, select: { id: true } });
  if (!seller) return res.status(400).json({ error: 'Vendedor não pertence à empresa.' });
  if (req.params.id) {
    const result = await prisma.product.updateMany({ where: { ...scope(req.user), id: req.params.id, status: 'stock' }, data });
    if (!result.count) return res.status(409).json({ error: 'Produto indisponível para edição. Vendas concluídas não podem ser alteradas.' });
    return res.json({ success: true });
  }
  res.status(201).json(await prisma.product.create({ data: { ...data, company_id: req.user.company_id } }));
}
router.post('/', wrap(save));
router.put('/:id', wrap(save));
router.post('/:id/sell', wrap(async (req, res) => {
  const result = await prisma.product.updateMany({ where: { ...scope(req.user), id: req.params.id, status: 'stock' }, data: { status: 'sold', sold_at: new Date() } });
  if (!result.count) return res.status(409).json({ error: 'Produto já vendido ou indisponível.' });
  res.json({ success: true });
}));
module.exports = router;
