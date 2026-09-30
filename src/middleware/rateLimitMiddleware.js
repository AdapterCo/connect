const rateLimit = require('express-rate-limit');

// Os limites sao por IP: a equipe de uma loja costuma compartilhar o mesmo IP
// publico, entao o teto geral precisa comportar varios usuarios da SPA ao mesmo
// tempo. Login e recuperacao de senha mantem limites estritos (authLimiter).
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 600,
  message: { error: 'Limite de requisições excedido. Tente novamente em 1 minuto.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Limite de uploads excedido. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  generalLimiter,
  authLimiter,
  apiLimiter,
  uploadLimiter
};
