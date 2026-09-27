const attempts = new Map();
const windowMs = 15 * 60 * 1000;
const cleanup = setInterval(() => { const now = Date.now(); for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key); }, 60000);
cleanup.unref();
module.exports = function (req, res, next) {
  const key = req.ip;
  let item = attempts.get(key);
  if (!item || item.until <= Date.now()) { item = { count: 0, until: Date.now() + windowMs }; attempts.set(key, item); }
  if (++item.count > 30) { res.set('Retry-After', String(Math.ceil((item.until - Date.now()) / 1000))); return res.status(429).json({ error: 'Muitas tentativas. Tente novamente mais tarde.' }); }
  next();
};
