const authenticateToken = require('./authMiddleware');

// Reaproveita a autenticacao completa (sessao conferida no banco) e exige que o
// perfil atual do usuario seja superadmin.
function requireSuperAdmin(req, res, next) {
  authenticateToken(req, res, () => {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Acesso negado. Requer privilegios de Super Admin.' });
    }
    next();
  });
}

module.exports = requireSuperAdmin;
