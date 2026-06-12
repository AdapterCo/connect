function validateLogin(req, res, next) {
  const { username, password } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    return res.status(400).json({ error: 'Usuário é obrigatório.' });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres.' });
  }

  if (username.length > 50) {
    return res.status(400).json({ error: 'Usuário muito longo.' });
  }

  req.body.username = username.trim().toLowerCase();
  next();
}

function validateRegister(req, res, next) {
  const { name, username, password, role } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres.' });
  }

  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: 'Usuário deve ter pelo menos 3 caracteres.' });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Usuário deve conter apenas letras, números e underscore.' });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres.' });
  }

  if (password.length > 128) {
    return res.status(400).json({ error: 'Senha muito longa.' });
  }

  const validRoles = ['admin', 'supervisor', 'seller', 'support', 'other'];
  if (!role || !validRoles.includes(role)) {
    return res.status(400).json({ error: 'Função inválida.' });
  }

  if (name.length > 100) {
    return res.status(400).json({ error: 'Nome muito longo.' });
  }

  if (username.length > 50) {
    return res.status(400).json({ error: 'Usuário muito longo.' });
  }

  req.body.name = name.trim();
  req.body.username = username.trim().toLowerCase();
  next();
}

function validateRegisterTenant(req, res, next) {
  const { companyName, companySlug, adminName, adminUsername, adminPassword } = req.body;

  if (!companyName || typeof companyName !== 'string' || companyName.trim().length < 2) {
    return res.status(400).json({ error: 'Nome da empresa deve ter pelo menos 2 caracteres.' });
  }

  if (!companySlug || typeof companySlug !== 'string' || !/^[a-z0-9-]+$/.test(companySlug)) {
    return res.status(400).json({ error: 'Slug deve conter apenas letras minúsculas, números e hífens.' });
  }

  if (!adminName || typeof adminName !== 'string' || adminName.trim().length < 2) {
    return res.status(400).json({ error: 'Nome do admin deve ter pelo menos 2 caracteres.' });
  }

  if (!adminUsername || typeof adminUsername !== 'string' || !/^[a-zA-Z0-9_]+$/.test(adminUsername)) {
    return res.status(400).json({ error: 'Username do admin deve conter apenas letras, números e underscore.' });
  }

  if (!adminPassword || typeof adminPassword !== 'string' || adminPassword.length < 6) {
    return res.status(400).json({ error: 'Senha do admin deve ter pelo menos 6 caracteres.' });
  }

  req.body.companyName = companyName.trim();
  req.body.companySlug = companySlug.trim().toLowerCase();
  req.body.adminName = adminName.trim();
  req.body.adminUsername = adminUsername.trim().toLowerCase();
  next();
}

function validateMessage(req, res, next) {
  const { text, mediaUrl } = req.body;

  if (!text && !mediaUrl) {
    return res.status(400).json({ error: 'Mensagem ou mídia é obrigatória.' });
  }

  if (text && typeof text === 'string' && text.length > 5000) {
    return res.status(400).json({ error: 'Mensagem muito longa (máximo 5000 caracteres).' });
  }

  if (mediaUrl && typeof mediaUrl === 'string' && !mediaUrl.startsWith('/uploads/')) {
    return res.status(400).json({ error: 'URL de mídia inválida.' });
  }

  next();
}

function validateCharge(req, res, next) {
  const { item, value } = req.body;

  if (!item || typeof item !== 'string' || item.trim().length === 0) {
    return res.status(400).json({ error: 'Item da cobrança é obrigatório.' });
  }

  if (!value || typeof value !== 'number' || value <= 0) {
    return res.status(400).json({ error: 'Valor deve ser um número positivo.' });
  }

  if (value > 1000000) {
    return res.status(400).json({ error: 'Valor excede o limite máximo.' });
  }

  if (item.length > 200) {
    return res.status(400).json({ error: 'Nome do item muito longo.' });
  }

  req.body.item = item.trim();
  next();
}

function validateSchedule(req, res, next) {
  const { scheduledTime } = req.body;

  if (!scheduledTime) {
    return res.status(400).json({ error: 'Data e hora do agendamento são obrigatórias.' });
  }

  const scheduleDate = new Date(scheduledTime);
  if (isNaN(scheduleDate.getTime()) || scheduleDate.getTime() < Date.now()) {
    return res.status(400).json({ error: 'Data de agendamento inválida ou no passado.' });
  }

  next();
}

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

function sanitizeBody(req, res, next) {
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeString(req.body[key]);
      }
    }
  }
  next();
}

module.exports = {
  validateLogin,
  validateRegister,
  validateRegisterTenant,
  validateMessage,
  validateCharge,
  validateSchedule,
  sanitizeBody
};
