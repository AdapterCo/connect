const { prisma } = require('../config/database');
const isManager = user => ['admin', 'supervisor', 'superadmin'].includes(user.role);
function managersOnly(req, res, next) { return isManager(req.user) ? next() : res.status(403).json({ error: 'Acesso restrito a administradores e supervisores.' }); }
async function ownChat(req, res, next) {
  if (isManager(req.user)) return next();
  if (!req.params.id) return next();
  try {
    const userInstances = await prisma.instance.findMany({
      where: { company_id: req.user.company_id, user_id: req.user.id },
      select: { id: true }
    });

    const userSector = req.user.sector || (req.user.role === 'seller' ? 'sales' : (req.user.role === 'support' ? 'support' : null));

    const where = {
      id: req.params.id,
      company_id: req.user.company_id
    };

    if (userInstances.length > 0) {
      where.instance_id = { in: userInstances.map(i => i.id) };
    } else {
      where.assigned_to = req.user.id;
    }

    if (userSector) {
      where.AND = [
        {
          OR: [
            { sector: userSector },
            { sector: null }
          ]
        }
      ];
    }

    const chat = await prisma.chat.findFirst({ where, select: { id: true } });
    if (!chat) return res.status(404).json({ error: 'Conversa indisponivel.' });
    next();
  } catch { res.status(500).json({ error: 'Erro ao verificar acesso.' }); }
}
module.exports = { isManager, managersOnly, ownChat };
