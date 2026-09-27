const { verifyToken } = require('../config/auth');

async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
  }

  const decoded = verifyToken(token);
  if (!decoded || typeof decoded.id !== 'string' || typeof decoded.company_id !== 'string') {
    return res.status(403).json({ error: 'Token inválido ou expirado.' });
  }

  try {
    const { prisma } = require('../config/database');
    const user = await prisma.user.findFirst({ where: { id: decoded.id, company_id: decoded.company_id }, select: { id: true, company_id: true, name: true, role: true, username: true } });
    if (!user) return res.status(401).json({ error: 'Conta indisponivel.' });
    req.user = user;
    next();
  } catch { res.status(503).json({ error: 'Autenticacao temporariamente indisponivel.' }); }
}

module.exports = authenticateToken;
