const ROLE_LEVEL = {
  other: 10,
  seller: 20,
  support: 20,
  supervisor: 50,
  admin: 80,
  superadmin: 100
};

function hasAnyRole(userRole, allowedRoles) {
  return allowedRoles.includes(userRole);
}

function hasMinimumRole(userRole, minimumRole) {
  return (ROLE_LEVEL[userRole] || 0) >= (ROLE_LEVEL[minimumRole] || 0);
}

function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !hasAnyRole(req.user.role, allowedRoles)) {
      return res.status(403).json({ error: 'Acesso negado para esta funcao.' });
    }
    next();
  };
}

function requireMinimumRole(minimumRole) {
  return (req, res, next) => {
    if (!req.user || !hasMinimumRole(req.user.role, minimumRole)) {
      return res.status(403).json({ error: 'Acesso negado para esta funcao.' });
    }
    next();
  };
}

module.exports = {
  requireRoles,
  requireMinimumRole,
  hasMinimumRole
};
