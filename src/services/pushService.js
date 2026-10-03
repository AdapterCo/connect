const webpush = require('web-push');
const { prisma } = require('../config/database');
const { encrypt, decrypt } = require('../utils/crypto');
const { fail } = require('./commercialService');
let configuration;
async function vapid() {
  if (!configuration) configuration = (async () => {
    const publicKey = process.env.VAPID_PUBLIC_KEY, privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!!publicKey !== !!privateKey) throw new Error('Configure as duas chaves VAPID.');
    if (publicKey && privateKey) return { publicKey, privateKey };
    const stored = await prisma.platformConfig.findUnique({ where: { name: 'webpush_vapid' } });
    if (stored) return { publicKey: stored.value.publicKey, privateKey: decrypt(stored.value.privateKey) };
    const keys = webpush.generateVAPIDKeys();
    const created = await prisma.platformConfig.upsert({ where: { name: 'webpush_vapid' }, update: {}, create: { name: 'webpush_vapid', value: { publicKey: keys.publicKey, privateKey: encrypt(keys.privateKey) } } });
    return { publicKey: created.value.publicKey, privateKey: decrypt(created.value.privateKey) };
  })().catch(error => { configuration = null; throw error; });
  return configuration;
}
function validateSubscription(body) {
  if (!body || typeof body.endpoint !== 'string' || body.endpoint.length > 2048) throw fail('Assinatura inválida.');
  let url;
  try { url = new URL(body.endpoint); } catch { throw fail('Endpoint inválido.'); }
  const host = url.hostname;
  // Do not allow a supplied endpoint to become an arbitrary HTTP request (SSRF).
  const allowed = host === 'fcm.googleapis.com' || host === 'web.push.apple.com' || host === 'updates.push.services.mozilla.com' ||
    host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com');
  if (!allowed || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash) throw fail('Serviço de push não permitido.');
  const keys = body.keys;
  if (!keys || !/^[A-Za-z0-9_-]{87}=?$/.test(keys.p256dh || '') || !/^[A-Za-z0-9_-]{22}={0,2}$/.test(keys.auth || '')) throw fail('Chaves de push inválidas.');
  return { endpoint: body.endpoint, keys: { auth: keys.auth, p256dh: keys.p256dh } };
}
async function send(userId, companyId, title, tag = 'commercial') {
  const user = await prisma.user.findFirst({ where: { id: userId, company_id: companyId, role: { in: ['seller', 'admin', 'supervisor'] } } });
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!user || !require('./accessService').companyActive(company)) return false;
  await prisma.pushSubscription.deleteMany({ where: { user_id: user.id, company_id: companyId, session_version: { not: user.session_version || 0 } } });
  const subscriptions = await prisma.pushSubscription.findMany({ where: { user_id: user.id, company_id: companyId, session_version: user.session_version || 0 } });
  if (!subscriptions.length) return false;
  const keys = await vapid();
  let delivered = false;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: subscription.keys }, JSON.stringify({ title, tag, url: '/commercial' }), {
        vapidDetails: { subject: process.env.VAPID_SUBJECT || `https://${process.env.DOMAIN || 'connect.adapterco.com.br'}`, ...keys },
        TTL: 60, urgency: 'high', timeout: 5000
      });
      delivered = true;
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) await prisma.pushSubscription.deleteMany({ where: { id: subscription.id, user_id: user.id } });
      else throw error;
    }
  }
  return delivered;
}
async function reminders(now = new Date()) {
  const tasks = await prisma.followUpTask.findMany({ where: { completed_at: null, reminded_at: null, due_at: { lte: now }, opportunity: { status: 'open' },
    owner: { role: { in: ['seller', 'admin', 'supervisor'] }, pushSubscriptions: { some: {} } } }, orderBy: { due_at: 'asc' }, take: 100 });
  for (const task of tasks) {
    try {
      const lead = await prisma.opportunity.findFirst({ where: { id: task.opportunity_id, company_id: task.company_id } });
      const user = await prisma.user.findFirst({ where: { id: task.owner_id, company_id: task.company_id } });
      if (!user || (user.role === 'seller' && lead?.seller_id !== user.id)) continue;
      const delivered = await send(task.owner_id, task.company_id, 'Há uma tarefa de retorno vencida.', `task-${task.id}`);
      if (delivered) await prisma.followUpTask.updateMany({ where: { id: task.id, completed_at: null }, data: { reminded_at: now } });
    } catch (error) { console.error('Task reminder failed:', error.code || error.name); }
  }
  const chats = await prisma.chat.findMany({ where: { status: 'interesse em compra', is_archived: false, is_blocked: false,
    assigned_to: { not: null }, sales_reply_due_at: { gt: now, lte: new Date(now.getTime() + 15000) } }, take: 100 });
  for (const chat of chats) {
    if (chat.sales_alerted_at && new Date(chat.sales_alerted_at) >= new Date(chat.claimed_at || 0)) continue;
    try {
      const delivered = await send(chat.assigned_to, chat.company_id, 'Prazo de captura do lead está terminando.', `sla-${chat.id}`);
      if (delivered) await prisma.chat.updateMany({ where: { id: chat.id, assigned_to: chat.assigned_to, sales_reply_due_at: chat.sales_reply_due_at }, data: { sales_alerted_at: now } });
    } catch (error) { console.error('SLA reminder failed:', error.code || error.name); }
  }
}
module.exports = { vapid, validateSubscription, send, reminders };
