const path = require('path');
const { UPLOAD_DIR } = require('../config/index');
function mediaPath(url) {
  if (typeof url !== 'string' || !/^\/uploads\/(?:[a-zA-Z0-9_-]+)\.(?:jpg|jpeg|png|gif|webp|mp4|mp3|ogg|wav|pdf|txt)$/.test(url)) throw new Error('Arquivo de midia invalido.');
  return path.join(UPLOAD_DIR, path.basename(url));
}
function ownerPrefix(user) { return require('crypto').createHash('sha256').update(user.company_id + ':' + user.id).digest('hex').slice(0, 24); }
async function canAccessMedia(user, url) {
  mediaPath(url);
  if (path.basename(url).startsWith(ownerPrefix(user) + '_')) return true;
  const { prisma } = require('../config/database');
  const where = { company_id: user.company_id, ...(['admin', 'supervisor'].includes(user.role) ? {} : { assigned_to: user.id }), messages: { some: { media_url: url } } };
  return !!(await prisma.chat.findFirst({ where, select: { id: true } }));
}
module.exports = { mediaPath, ownerPrefix, canAccessMedia };
