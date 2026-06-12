const { verifyToken } = require('../config/auth');

function requireSuperAdmin(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'superadmin') {
    return res.status(403).json({ error: 'Acesso negado. Requer privilégios de Super Admin.' });
  }

  req.user = decoded;
  next();
}

module.exports = requireSuperAdmin;
