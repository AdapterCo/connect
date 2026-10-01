const { verifyToken } = require('../config/auth');
const { prisma } = require('../config/database');

const SESSION_COOKIE = 'crm_session';

function getBearerToken(req) {
  const authHeader = req.headers.authorization;
  const parts = typeof authHeader === 'string' ? authHeader.trim().split(/\s+/) : [];
  return parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : null;
}

function getCookie(req, name) {
  const cookies = typeof req.headers.cookie === 'string' ? req.headers.cookie.split(';') : [];
  for (const cookie of cookies) {
    const index = cookie.indexOf('=');
    if (index > 0 && cookie.slice(0, index).trim() === name) {
      try { return decodeURIComponent(cookie.slice(index + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

// O navegador autentica pelo cookie HttpOnly (inacessivel a scripts); o header
// Bearer continua aceito para integracoes e testes.
function getToken(req) {
  return getBearerToken(req) || getCookie(req, SESSION_COOKIE);
}

async function authenticateToken(req, res, next) {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Acesso negado. Token nao fornecido.' });
  }

  const decoded = verifyToken(token);
  if (!decoded || typeof decoded.id !== 'string' || typeof decoded.company_id !== 'string') {
    return res.status(403).json({ error: 'Token invalido ou expirado.' });
  }

  try {
    // Todo token, inclusive de superadmin, e conferido no banco: perfil atual e
    // session_version (revogacao de sessoes e troca de senha).
    const user = await prisma.user.findFirst({
      where: { id: decoded.id, company_id: decoded.company_id },
      select: { id: true, name: true, username: true, company_id: true, role: true, sector: true, session_version: true }
    });

    if (!user || Number(user.session_version || 0) !== Number(decoded.session_version || 0)) {
      return res.status(401).json({ error: 'Sessao expirada. Faça login novamente.' });
    }
    Object.assign(decoded, user);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao validar sessao.' });
  }

  req.user = decoded;
  next();
}

authenticateToken.getBearerToken = getBearerToken;
authenticateToken.SESSION_COOKIE = SESSION_COOKIE;

module.exports = authenticateToken;
