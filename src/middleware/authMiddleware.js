const { verifyToken } = require('../config/auth');

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  const parts = typeof authHeader === 'string' ? authHeader.trim().split(/\s+/) : [];
  return parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : null;
}

function authenticateToken(req, res, next) {
  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Acesso negado. Token nao fornecido.' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ error: 'Token invalido ou expirado.' });
  }

  req.user = decoded;
  next();
}

authenticateToken.getBearerToken = getBearerToken;

module.exports = authenticateToken;
