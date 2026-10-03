const router = require('express').Router();
const { prisma } = require('../config/database');
const push = require('../services/pushService');
router.use(require('../middleware/authMiddleware'), require('../middleware/planMiddleware').checkCompanyActive,
  (req, res, next) => ['admin', 'supervisor', 'seller'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Acesso restrito.' }));
const wrap = fn => async (req, res) => {
  try { await fn(req, res); } catch (error) {
    console.error('Push operation failed:', error.code || error.name);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Não foi possível configurar notificações.' });
  }
};
router.get('/key', wrap(async (req, res) => res.json({ publicKey: (await push.vapid()).publicKey })));
router.post('/subscriptions', wrap(async (req, res) => {
  const data = push.validateSubscription(req.body);
  await require('../services/commercialService').transaction(req.user, async tx => {
    const stored = await tx.pushSubscription.findUnique({ where: { endpoint: data.endpoint } });
    // Shared browser may be reused after logout; an active account's subscription cannot be stolen.
    if (stored && stored.user_id !== req.user.id) {
      const owner = await tx.user.findFirst({ where: { id: stored.user_id, company_id: stored.company_id } });
      if (owner && Number(owner.session_version || 0) === stored.session_version) throw require('../services/commercialService').fail('Desative notificações da conta anterior neste navegador.', 409);
      await tx.pushSubscription.deleteMany({ where: { id: stored.id } });
    }
    if ((!stored || stored.user_id !== req.user.id) && await tx.pushSubscription.count({ where: { user_id: req.user.id, company_id: req.user.company_id } }) >= 5) throw require('../services/commercialService').fail('Limite de cinco dispositivos atingido.', 409);
    const registered = await tx.pushSubscription.upsert({ where: { endpoint: data.endpoint },
      create: { ...data, company_id: req.user.company_id, user_id: req.user.id, session_version: req.user.session_version || 0 },
      update: { keys: data.keys, session_version: req.user.session_version || 0 } });
    if (registered.user_id !== req.user.id || registered.company_id !== req.user.company_id) throw require('../services/commercialService').fail('Assinatura alterada simultaneamente. Tente novamente.', 409);
  });
  res.json({ success: true });
}));
router.delete('/subscriptions', wrap(async (req, res) => {
  await prisma.pushSubscription.deleteMany({ where: { user_id: req.user.id, company_id: req.user.company_id,
    ...(req.body.endpoint ? { endpoint: req.body.endpoint } : {}) } });
  res.json({ success: true });
}));
module.exports = router;
