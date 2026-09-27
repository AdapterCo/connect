const { prisma } = require('../config/database');
const isManager = user => ['admin', 'supervisor'].includes(user.role);
function managersOnly(req, res, next) { return isManager(req.user) ? next() : res.status(403).json({ error: 'Acesso restrito a administradores e supervisores.' }); }
async function ownChat(req, res, next) {
  if (isManager(req.user)) return next();
  if (!req.params.id) return next();
  try {
    const chat = await prisma.chat.findFirst({ where: { id: req.params.id, company_id: req.user.company_id, assigned_to: req.user.id }, select: { id: true } });
    if (!chat) return res.status(404).json({ error: 'Conversa indisponivel.' });
    next();
  } catch { res.status(500).json({ error: 'Erro ao verificar acesso.' }); }
}
module.exports = { isManager, managersOnly, ownChat };
