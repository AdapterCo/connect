const MAX_MESSAGES = 500;
const TTL_MS = 24 * 60 * 60 * 1000;
function remember(state, id, message, now = Date.now()) {
  if (!id || !message) return;
  const cache = state.sentMessages ||= new Map();
  for (const [key, value] of cache) if (now - value.at >= TTL_MS) cache.delete(key);
  cache.set(id, { message, at: now });
  while (cache.size > MAX_MESSAGES) cache.delete(cache.keys().next().value);
}
function get(state, id, now = Date.now()) {
  const value = state.sentMessages?.get(id);
  if (!value) return undefined;
  if (now - value.at >= TTL_MS) { state.sentMessages.delete(id); return undefined; }
  return value.message;
}
module.exports = { remember, get };
