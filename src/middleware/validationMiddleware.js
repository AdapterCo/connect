// Politica unica de senha para cadastro, redefinicao e bootstrap do superadmin.
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

function passwordError(password, label = 'Senha') {
  if (!password || typeof password !== 'string' || password.length < PASSWORD_MIN) {
    return `${label} deve ter pelo menos ${PASSWORD_MIN} caracteres.`;
  }
  if (password.length > PASSWORD_MAX) {
    return `${label} muito longa (máximo ${PASSWORD_MAX} caracteres).`;
  }
  return null;
}

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

// E-mail opcional: vazio vira null; invalido gera erro. Sempre em minusculas.
function normalizeEmail(value) {
  if (value === undefined || value === null || value === '') return { email: null };
  if (typeof value !== 'string' || !EMAIL_PATTERN.test(value.trim()) || value.trim().length > 254) {
    return { error: 'E-mail inválido.' };
  }
  return { email: value.trim().toLowerCase() };
}

function validateLogin(req, res, next) {
  const { username, password } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    return res.status(400).json({ error: 'Usuário é obrigatório.' });
  }

  // No login so se exige a senha: a politica de tamanho vale ao definir a senha.
  if (!password || typeof password !== 'string' || password.length > PASSWORD_MAX) {
    return res.status(400).json({ error: 'Usuário ou senha incorretos.' });
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

  const invalidPassword = passwordError(password);
  if (invalidPassword) {
    return res.status(400).json({ error: invalidPassword });
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

  const { email, error: emailError } = normalizeEmail(req.body.email);
  if (emailError) {
    return res.status(400).json({ error: emailError });
  }

  req.body.name = name.trim();
  req.body.username = username.trim().toLowerCase();
  req.body.email = email;
  next();
}

function validateRegisterTenant(req, res, next) {
  const { companyName, companySlug, adminName, adminUsername, adminPassword, planId } = req.body;

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

  const invalidPassword = passwordError(adminPassword, 'Senha do admin');
  if (invalidPassword) {
    return res.status(400).json({ error: invalidPassword });
  }

  if (!planId || typeof planId !== 'string') {
    return res.status(400).json({ error: 'Plano é obrigatório.' });
  }

  req.body.companyName = companyName.trim();
  req.body.companySlug = companySlug.trim().toLowerCase();
  req.body.adminName = adminName.trim();
  req.body.adminUsername = adminUsername.trim().toLowerCase();
  req.body.planId = planId.trim();
  next();
}

const MEDIA_TYPES = ['image', 'video', 'audio', 'document'];
const MAX_TEXT = 5000;

// Campos de mensagem compartilhados por envio imediato e agendamento.
function messageFieldsError({ text, mediaUrl, mediaType, fileName }) {
  if (text !== undefined && text !== null && typeof text !== 'string') return 'Mensagem inválida.';
  if (typeof text === 'string' && text.length > MAX_TEXT) return `Mensagem muito longa (máximo ${MAX_TEXT} caracteres).`;
  if (mediaUrl !== undefined && mediaUrl !== null && (typeof mediaUrl !== 'string' || !mediaUrl.startsWith('/uploads/'))) return 'URL de mídia inválida.';
  if (mediaUrl && !MEDIA_TYPES.includes(mediaType)) return 'Tipo de mídia inválido.';
  if (fileName !== undefined && fileName !== null && (typeof fileName !== 'string' || fileName.length > 200)) return 'Nome de arquivo inválido.';
  return null;
}

function validateMessage(req, res, next) {
  const { text, mediaUrl } = req.body;

  if (!text && !mediaUrl) {
    return res.status(400).json({ error: 'Mensagem ou mídia é obrigatória.' });
  }

  const invalid = messageFieldsError(req.body);
  if (invalid) {
    return res.status(400).json({ error: invalid });
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

  if (scheduleDate.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1000) {
    return res.status(400).json({ error: 'Agendamento limitado a um ano.' });
  }

  if (!req.body.text && !req.body.mediaUrl) {
    return res.status(400).json({ error: 'Mensagem ou mídia é obrigatória.' });
  }

  const invalid = messageFieldsError(req.body);
  if (invalid) {
    return res.status(400).json({ error: invalid });
  }

  next();
}

module.exports = {
  PASSWORD_MIN,
  PASSWORD_MAX,
  passwordError,
  normalizeEmail,
  validateLogin,
  validateRegister,
  validateRegisterTenant,
  validateMessage,
  validateCharge,
  validateSchedule
};
