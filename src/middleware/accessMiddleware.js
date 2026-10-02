const { prisma } = require('../config/database');
const { isManager, chatScope } = require('../services/accessService');
function managersOnly(req, res, next) { return isManager(req.user) ? next() : res.status(403).json({ error: 'Acesso restrito a gestores.' }); }
async function ownChat(req, res, next) {
  if (!req.params.id) return next();
  try {
    const chat = await prisma.chat.findFirst({ where: { ...await chatScope(req.user), id: req.params.id }, select: { id: true } });
    if (!chat) return res.status(404).json({ error: 'Conversa indisponivel.' });
    next();
  } catch { res.status(500).json({ error: 'Erro ao verificar acesso.' }); }
}
module.exports = { isManager, managersOnly, ownChat };
