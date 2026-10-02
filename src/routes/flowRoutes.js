const router = require('express').Router();
const { prisma } = require('../config/database');
const auth = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const { requireRoles } = require('../middleware/rbacMiddleware');
const audit = require('../middleware/auditMiddleware');
const flowService = require('../services/flowService');

const MAX_FLOWS = 50;

// Fluxos sao montados por gestores (admin e supervisor).
router.use(auth, checkCompanyActive, requireRoles('admin', 'supervisor'));

const wrap = handler => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (error instanceof flowService.FlowValidationError) return res.status(400).json({ error: error.message });
    console.error('Flow request failed:', error.code || error.name);
    res.status(500).json({ error: 'Não foi possível concluir a operação.' });
  }
};

const summary = flow => ({
  id: flow.id,
  name: flow.name,
  is_active: flow.is_active,
  node_count: Array.isArray(flow.graph?.nodes) ? flow.graph.nodes.length : 0,
  updated_at: flow.updated_at
});

async function findOwned(req) {
  return prisma.flow.findFirst({ where: { id: req.params.id, company_id: req.user.company_id } });
}

router.get('/', wrap(async (req, res) => {
  const flows = await prisma.flow.findMany({ where: { company_id: req.user.company_id }, orderBy: { created_at: 'asc' } });
  res.json(flows.map(summary));
}));

router.post('/', audit('flow', 'create'), wrap(async (req, res) => {
  const name = flowService.flowName(req.body.name);
  const flow = await require('../services/salesRotationService').withCompanyLock(req.user.company_id, async tx => {
    if (await tx.flow.count({ where: { company_id: req.user.company_id } }) >= MAX_FLOWS) throw new flowService.FlowValidationError('Limite de fluxos atingido.');
    return tx.flow.create({ data: { company_id: req.user.company_id, name, graph: flowService.defaultGraph() } });
  });
  res.status(201).json({ ...summary(flow), graph: flow.graph });
}));

router.get('/:id', wrap(async (req, res) => {
  const flow = await findOwned(req);
  if (!flow) return res.status(404).json({ error: 'Fluxo não encontrado.' });
  res.json({ ...summary(flow), graph: flow.graph });
}));

router.put('/:id', audit('flow', 'update'), wrap(async (req, res) => {
  const flow = await findOwned(req);
  if (!flow) return res.status(404).json({ error: 'Fluxo não encontrado.' });

  const data = {};
  if (req.body.name !== undefined) data.name = flowService.flowName(req.body.name);
  if (req.body.graph !== undefined) {
    data.graph = flowService.validateGraph(req.body.graph);
    // Um fluxo ativo continua atendendo: precisa seguir valido para execucao.
    if (flow.is_active) flowService.assertActivatable(data.graph);
  }

  const updated = await prisma.flow.update({ where: { id: flow.id }, data });
  res.json({ ...summary(updated), graph: updated.graph });
}));

// Ativar um fluxo desativa os demais: cada conversa nova usa um unico fluxo.
router.post('/:id/active', audit('flow', 'toggle_active'), wrap(async (req, res) => {
  if (typeof req.body.active !== 'boolean') return res.status(400).json({ error: 'Informe se o fluxo deve ficar ativo.' });
  const flow = await findOwned(req);
  if (!flow) return res.status(404).json({ error: 'Fluxo não encontrado.' });

  if (req.body.active) {
    flowService.assertActivatable(flowService.validateGraph(flow.graph));
    await require('../services/salesRotationService').withCompanyLock(req.user.company_id, async tx => {
      await tx.flow.updateMany({ where: { company_id: req.user.company_id, id: { not: flow.id } }, data: { is_active: false } });
      await tx.flow.update({ where: { id: flow.id }, data: { is_active: true } });
    });
  } else {
    await prisma.flow.update({ where: { id: flow.id }, data: { is_active: false } });
  }
  res.json({ success: true, is_active: req.body.active });
}));

router.delete('/:id', audit('flow', 'delete'), wrap(async (req, res) => {
  const result = await prisma.flow.deleteMany({ where: { id: req.params.id, company_id: req.user.company_id } });
  if (!result.count) return res.status(404).json({ error: 'Fluxo não encontrado.' });
  res.json({ success: true });
}));

module.exports = router;
