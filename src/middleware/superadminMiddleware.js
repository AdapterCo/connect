const { verifyToken } = require('../config/auth');
const authenticateToken = require('./authMiddleware');

function requireSuperAdmin(req, res, next) {
  const token = authenticateToken.getBearerToken(req);

  if (!token) {
    return res.status(401).json({ error: 'Token nao fornecido.' });
  }

  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'superadmin') {
    return res.status(403).json({ error: 'Acesso negado. Requer privilegios de Super Admin.' });
  }

  req.user = decoded;
  next();
}

module.exports = requireSuperAdmin;
