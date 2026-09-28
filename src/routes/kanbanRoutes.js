const router = require('express').Router();
const { prisma } = require('../config/database');
const Chat = require('../models/Chat');
const auth = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const { withCompanyLock } = require('../services/salesRotationService');

const FIXED_COLUMNS = Object.freeze([
  { id: 'iniciada', name: 'Iniciada / Novo', fixed: true },
  { id: 'interesse em compra', name: 'Interesse em Compra', fixed: true },
  { id: 'finalizada', name: 'Finalizada / Pago', fixed: true }
]);
const isFixed = id => FIXED_COLUMNS.some(column => column.id === id);
const manager = user => ['admin', 'supervisor'].includes(user.role);
const owner = user => ({ user_id: user.id, company_id: user.company_id });
const chatScope = user => ({ company_id: user.company_id, ...(!manager(user) ? { assigned_to: user.id } : {}) });
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function columnName(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 60) throw Object.assign(new Error('Nome deve ter entre 1 e 60 caracteres.'), { status: 400 });
  const name = value.trim().replace(/\s+/g, ' ');
  if (FIXED_COLUMNS.some(column => [column.id, column.name].some(label => normalize(label) === normalize(name)))) {
    throw Object.assign(new Error('Esse nome pertence a uma coluna fixa.'), { status: 400 });
  }
  return name;
}
const wrap = handler => async (req, res) => {
  try { await handler(req, res); }
  catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ error: 'Você já possui uma coluna com esse nome.' });
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Não foi possível atualizar o Kanban.' });
  }
};
router.use(auth, checkCompanyActive);
router.get('/', wrap(async (req, res) => {
  const [columns, placements] = await Promise.all([
    prisma.kanbanColumn.findMany({ where: owner(req.user), orderBy: [{ created_at: 'asc' }, { id: 'asc' }], select: { id: true, name: true } }),
    prisma.kanbanCard.findMany({ where: { ...owner(req.user), chat: chatScope(req.user) }, select: { chat_id: true, column_id: true } })
  ]);
  res.json({ columns: [...FIXED_COLUMNS, ...columns.map(column => ({ ...column, fixed: false }))], placements });
}));
router.post('/columns', wrap(async (req, res) => {
  const name = columnName(req.body.name);
  const column = await withCompanyLock(req.user.company_id, async tx => {
    if (await tx.kanbanColumn.count({ where: owner(req.user) }) >= 50) throw Object.assign(new Error('Limite de 50 colunas pessoais atingido.'), { status: 400 });
    return tx.kanbanColumn.create({ data: { ...owner(req.user), name }, select: { id: true, name: true } });
  });
  res.status(201).json({ ...column, fixed: false });
}));
router.patch('/columns/:id', wrap(async (req, res) => {
  if (isFixed(req.params.id)) return res.status(403).json({ error: 'Colunas fixas não podem ser alteradas.' });
  const name = columnName(req.body.name);
  const result = await prisma.kanbanColumn.updateMany({ where: { ...owner(req.user), id: req.params.id }, data: { name } });
  if (!result.count) return res.status(404).json({ error: 'Coluna não encontrada.' });
  res.json({ success: true });
}));
router.delete('/columns/:id', wrap(async (req, res) => {
  if (isFixed(req.params.id)) return res.status(403).json({ error: 'Colunas fixas não podem ser excluídas.' });
  const result = await withCompanyLock(req.user.company_id, tx => tx.kanbanColumn.deleteMany({ where: { ...owner(req.user), id: req.params.id } }));
  if (!result.count) return res.status(404).json({ error: 'Coluna não encontrada.' });
  res.json({ success: true });
}));
router.put('/cards/:id', wrap(async (req, res) => {
  const columnId = req.body.column_id;
  if (typeof columnId !== 'string') return res.status(400).json({ error: 'Selecione uma coluna.' });
  if (isFixed(columnId)) {
    const chat = await Chat.update(req.params.id, { status: columnId }, req.user.company_id, req.user);
    if (!chat) return res.status(404).json({ error: 'Conversa não encontrada.' });
    await prisma.kanbanCard.deleteMany({ where: { ...owner(req.user), chat_id: chat.id } });
    require('../config/socket').emitToCompany(req.user.company_id, 'chat_updated', chat);
    return res.json({ success: true, chat });
  }
  await withCompanyLock(req.user.company_id, async tx => {
    const column = await tx.kanbanColumn.findFirst({ where: { ...owner(req.user), id: columnId } });
    const chat = await tx.chat.findFirst({ where: { ...chatScope(req.user), id: req.params.id } });
    if (!column || !chat) throw Object.assign(new Error('Conversa ou coluna indisponível.'), { status: 404 });
    await tx.kanbanCard.upsert({
      where: { user_id_chat_id: { user_id: req.user.id, chat_id: chat.id } },
      create: { ...owner(req.user), chat_id: chat.id, column_id: columnId }, update: { column_id: columnId }
    });
  });
  res.json({ success: true });
}));
module.exports = router;
module.exports.FIXED_COLUMNS = FIXED_COLUMNS;
