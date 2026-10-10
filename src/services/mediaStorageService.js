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
// A varredura completa (pasta de uploads + mensagens com midia) custa caro: o
// uso fica em memoria e so e recalculado a cada USAGE_TTL_MS. Entre recalculos,
// cada arquivo aceito soma ao valor; exclusoes aparecem no proximo recalculo.
const USAGE_TTL_MS = 5 * 60 * 1000;
const usageCache = new Map();

// newBytes: tamanho do arquivo novo. stored: o arquivo ja esta gravado na pasta
// (upload pelo painel), entao uma varredura nova ja o inclui.
async function checkQuota(companyId, newBytes = 0, { stored = false } = {}) {
  const max = Number(process.env.MEDIA_QUOTA_MB || 1024) * 1024 * 1024;
  if (!Number.isFinite(max) || max <= 0) throw new Error('Quota de midia invalida.');
  const cached = usageCache.get(companyId);
  const fresh = cached && Date.now() - cached.at < USAGE_TTL_MS;
  const used = fresh ? cached.bytes + newBytes : await scanUsage(companyId) + (stored ? 0 : newBytes);
  if (used > max) throw Object.assign(new Error('Quota de armazenamento de midia excedida.'), { status: 413 });
  usageCache.set(companyId, { bytes: used, at: fresh ? cached.at : Date.now() });
}

async function scanUsage(companyId) {
  const [users, messages, schedules] = await Promise.all([
    prisma.user.findMany({ where: { company_id: companyId }, select: { id: true, company_id: true } }),
    prisma.message.findMany({ where: { chat: { company_id: companyId }, media_url: { not: null } }, select: { media_url: true } }),
    prisma.scheduledMessage.findMany({ where: { company_id: companyId, media_url: { not: null } }, select: { media_url: true } })
  ]);
  const prefixes = [tenantPrefix(companyId) + '_', ...users.map(user => ownerPrefix(user) + '_')];
  const referenced = new Set([...messages, ...schedules].map(item => path.basename(item.media_url || '')));
  let used = 0;
  for (const name of await fs.promises.readdir(UPLOAD_DIR)) {
    if (!prefixes.some(prefix => name.startsWith(prefix)) && !referenced.has(name)) continue;
    const stat = await fs.promises.stat(path.join(UPLOAD_DIR, name)).catch(() => null);
    if (stat?.isFile()) used += stat.size;
  }
  return used;
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
