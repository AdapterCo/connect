const { verifyToken } = require('../config/auth');
const { prisma } = require('../config/database');

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  const parts = typeof authHeader === 'string' ? authHeader.trim().split(/\s+/) : [];
  return parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : null;
}

async function authenticateToken(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Acesso negado. Token nao fornecido.' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ error: 'Token invalido ou expirado.' });
  }

  try {
    if (decoded.id && decoded.company_id && decoded.role !== 'superadmin') {
      const user = await prisma.user.findFirst({
        where: { id: decoded.id, company_id: decoded.company_id },
        select: { session_version: true }
      });

      if (!user || Number(user.session_version || 0) !== Number(decoded.session_version || 0)) {
        return res.status(401).json({ error: 'Sessao expirada. Faça login novamente.' });
      }
    }
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao validar sessao.' });
  }

  req.user = decoded;
  next();
}

authenticateToken.getBearerToken = getBearerToken;

module.exports = authenticateToken;
