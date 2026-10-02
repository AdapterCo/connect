const fs = require('fs');
const { prisma } = require('../config/database');
const { mediaPath } = require('../utils/media');
async function enqueue(tx, urls) {
  for (const url of [...new Set(urls.filter(Boolean))]) {
    try { mediaPath(url); } catch { continue; }
    await tx.mediaDeletion.upsert({ where: { url }, update: {}, create: { url } });
  }
}
async function cleanPending() {
  const jobs = await prisma.mediaDeletion.findMany({ orderBy: { created_at: 'asc' }, take: 100 });
  for (const job of jobs) {
    const [message, schedule] = await Promise.all([
      prisma.message.findFirst({ where: { media_url: job.url }, select: { id: true } }),
      prisma.scheduledMessage.findFirst({ where: { media_url: job.url, status: { in: ['pending', 'processing'] } }, select: { id: true } })
    ]);
    if (message || schedule) continue;
    try {
      await fs.promises.unlink(mediaPath(job.url)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      await prisma.mediaDeletion.deleteMany({ where: { url: job.url } });
    } catch { await prisma.mediaDeletion.update({ where: { url: job.url }, data: { attempts: { increment: 1 } } }); }
  }
}
module.exports = { enqueue, cleanPending };
