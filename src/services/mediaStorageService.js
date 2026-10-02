const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { prisma } = require('../config/database');
const { UPLOAD_DIR } = require('../config/index');
const { ownerPrefix } = require('../utils/media');
const locks = new Map();
const tenantPrefix = companyId => 'tenant_' + crypto.createHash('sha256').update(companyId).digest('hex').slice(0, 24);
async function withMediaLock(companyId, work) {
  const prior = locks.get(companyId) || Promise.resolve();
  const job = prior.catch(() => {}).then(work);
  locks.set(companyId, job);
  try { return await job; } finally { if (locks.get(companyId) === job) locks.delete(companyId); }
}
async function checkQuota(companyId, additionalBytes = 0) {
  const max = Number(process.env.MEDIA_QUOTA_MB || 1024) * 1024 * 1024;
  if (!Number.isFinite(max) || max <= 0) throw new Error('Quota de midia invalida.');
  const [users, messages, schedules] = await Promise.all([
    prisma.user.findMany({ where: { company_id: companyId }, select: { id: true, company_id: true } }),
    prisma.message.findMany({ where: { chat: { company_id: companyId }, media_url: { not: null } }, select: { media_url: true } }),
    prisma.scheduledMessage.findMany({ where: { company_id: companyId, media_url: { not: null } }, select: { media_url: true } })
  ]);
  const prefixes = [tenantPrefix(companyId) + '_', ...users.map(user => ownerPrefix(user) + '_')];
  const referenced = new Set([...messages, ...schedules].map(item => path.basename(item.media_url || '')));
  let used = additionalBytes;
  for (const name of await fs.promises.readdir(UPLOAD_DIR)) {
    if (!prefixes.some(prefix => name.startsWith(prefix)) && !referenced.has(name)) continue;
    const stat = await fs.promises.stat(path.join(UPLOAD_DIR, name)).catch(() => null);
    if (stat?.isFile()) used += stat.size;
  }
  if (used > max) throw Object.assign(new Error('Quota de armazenamento de midia excedida.'), { status: 413 });
}
async function cleanOrphans() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const name of await fs.promises.readdir(UPLOAD_DIR)) {
    const url = '/uploads/' + name;
    try { require('../utils/media').mediaPath(url); } catch { continue; }
    const stat = await fs.promises.stat(path.join(UPLOAD_DIR, name)).catch(() => null);
    if (!stat?.isFile() || stat.mtimeMs > cutoff) continue;
    const [message, schedule] = await Promise.all([
      prisma.message.findFirst({ where: { media_url: url }, select: { id: true } }),
      prisma.scheduledMessage.findFirst({ where: { media_url: url, status: { in: ['pending', 'processing'] } }, select: { id: true } })
    ]);
    if (!message && !schedule) await require('./mediaCleanupService').enqueue(prisma, [url]);
  }
}
module.exports = { tenantPrefix, withMediaLock, checkQuota, cleanOrphans };
