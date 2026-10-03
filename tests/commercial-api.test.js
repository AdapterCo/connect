const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
process.env.JWT_SECRET = 'commercial-test-only-'.repeat(3);
process.env.ENCRYPTION_KEY = 'commercial-test-key-'.repeat(3);
process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';
const names = ['company', 'user', 'instance', 'chat', 'message', 'opportunity', 'product', 'productModel', 'category', 'sale', 'saleReceipt', 'afterSale', 'followUpTask', 'cannedReply', 'auditLog', 'pushSubscription', 'platformConfig'];
let db, queue = Promise.resolve();
function relation(row, key) {
  const links = { opportunity: ['opportunity', 'opportunity_id'], sale: ['sale', 'sale_id'], product: ['product', 'product_id'], instance: ['instance', 'instance_id'] };
  if (links[key]) return db[links[key][0]].find(item => item.id === row[links[key][1]]) || null;
  const children = { receipts: ['saleReceipt', 'sale_id'], after_sales: ['afterSale', 'sale_id'], messages: ['message', 'chat_id'], sales: ['sale', 'opportunity_id'] };
  if (children[key]) return db[children[key][0]].filter(item => item[children[key][1]] === row.id);
  return row[key];
}
function matches(row, where = {}) {
  if (!row) return false;
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === 'OR') return value.some(part => matches(row, part));
    if (key === 'AND') return value.every(part => matches(row, part));
    if (key === 'company_id_phone') return matches(row, value);
    const actual = relation(row, key);
    if (Array.isArray(actual) && value?.some) return actual.some(item => matches(item, value.some));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      const operators = Object.keys(value);
      if (operators.some(op => ['in', 'not', 'lt', 'lte', 'gt', 'gte'].includes(op))) return operators.every(op => {
        if (op === 'in') return value.in.includes(actual);
        if (op === 'not') return (actual ?? null) !== value.not;
        if (op === 'lt') return actual != null && actual < value.lt;
        if (op === 'lte') return actual != null && actual <= value.lte;
        if (op === 'gt') return actual != null && actual > value.gt;
        if (op === 'gte') return actual != null && actual >= value.gte;
        return false;
      });
      return matches(actual, value);
    }
    return value instanceof Date ? actual?.getTime() === value.getTime() : (actual ?? null) === value;
  });
}
function result(row, query = {}) {
  if (!row) return null;
  const out = query.select ? {} : structuredClone(row);
  for (const [key, rule] of Object.entries(query.include || query.select || {})) {
    if (!rule) continue;
    const value = relation(row, key);
    out[key] = Array.isArray(value) ? value.filter(item => matches(item, rule.where)).map(item => result(item, rule === true ? {} : rule)) : rule === true ? value : result(value, rule);
  }
  return out;
}
const prisma = Object.fromEntries(names.map(name => [name, {
  findUnique: async query => result(db[name].find(row => matches(row, query.where)), query),
  findFirst: async (query = {}) => result(db[name].find(row => matches(row, query.where)), query),
  findMany: async (query = {}) => db[name].filter(row => matches(row, query.where)).slice(0, query.take || Infinity).map(row => result(row, query)),
  count: async (query = {}) => db[name].filter(row => matches(row, query.where)).length,
  create: async ({ data }) => {
    const defaults = { opportunity: { status: 'open', product: null, variant: null, payment: null, purchase_confirmed: false, lost_reason: null }, product: { status: 'stock', cost: null, commission_rate: '0' }, followUpTask: { completed_at: null, reminded_at: null }, afterSale: { status: 'open' }, sale: { status: 'sold' } };
    const row = { id: `${name}-${db[name].length + 1}`, created_at: new Date(), updated_at: new Date(), ...defaults[name], ...structuredClone(data) }; db[name].push(row); return structuredClone(row);
  },
  update: async ({ where, data }) => { const row = db[name].find(item => matches(item, where)); if (!row) throw new Error('Missing row'); Object.assign(row, structuredClone(data)); return structuredClone(row); },
  updateMany: async ({ where, data }) => { const rows = db[name].filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, structuredClone(data))); return { count: rows.length }; },
  deleteMany: async ({ where }) => { const rows = db[name].filter(row => matches(row, where)); db[name] = db[name].filter(row => !matches(row, where)); return { count: rows.length }; },
  upsert: async ({ where, create, update }) => { const row = db[name].find(item => matches(item, where)); return row ? Object.assign(row, update) : prisma[name].create({ data: create }); }
}]));
prisma.$queryRaw = async () => [{ id: 'c1' }];
prisma.$transaction = work => {
  const transaction = queue.then(async () => { const before = structuredClone(db); try { return await work(prisma); } catch (error) { db = before; throw error; } });
  queue = transaction.catch(() => {}); return transaction;
};
require.cache[require.resolve('../src/config/database')] = { exports: { prisma } };
const service = require('../src/services/commercialService');
const push = require('../src/services/pushService');
const { generateToken } = require('../src/config/auth');
let server, base;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use('/commercial', require('../src/routes/commercialRoutes')); app.use('/products', require('../src/routes/productRoutes')); app.use('/push', require('../src/routes/pushRoutes'));
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise(resolve => server.close(resolve)));
test.beforeEach(() => {
  db = Object.fromEntries(names.map(name => [name, []]));
  db.company = ['c1', 'c2'].map(id => ({ id, is_active: true, max_products: 100 }));
  db.productModel = [{ id: 'model1', company_id: 'c1', name: 'iPhone 13', kind: 'phone', price: '100.50', cost: '60.00', commission_rate: '10.00', is_active: true }, { id: 'model2', company_id: 'c1', name: 'Moto X', kind: 'motorcycle', price: '2000.00', commission_rate: '0', is_active: true }, { id: 'model3', company_id: 'c2', name: 'Foreign', kind: 'phone', price: '200', is_active: true }];
  db.user = [{ id: 'a1', company_id: 'c1', role: 'admin', name: 'Admin' }, { id: 's1', company_id: 'c1', role: 'seller', name: 'One' }, { id: 's2', company_id: 'c1', role: 'seller' }, { id: 's3', company_id: 'c2', role: 'seller' }, { id: 'support', company_id: 'c1', role: 'support' }, { id: 'm1', company_id: 'c1', role: 'supervisor' }];
  db.opportunity = [{ id: 'l1', company_id: 'c1', phone: '5521999990001', client_name: 'Client one', seller_id: 's1', status: 'open', product: 'iPhone 13', payment: 'Pix' }, { id: 'l2', company_id: 'c1', phone: '5521999990002', client_name: 'Client two', seller_id: 's2', status: 'open' }, { id: 'l3', company_id: 'c2', phone: '5521999990003', seller_id: 's3', status: 'open' }];
  db.product = ['s1', 's2', 's3'].map((seller_id, index) => ({ id: 'p' + (index + 1), company_id: index === 2 ? 'c2' : 'c1', seller_id, name: 'iPhone 13', price: 100.50, cost: '60.00', supplier_name: 'Supplier secret', serial: 'SERIAL-' + index, payment_method: 'pix', status: 'stock', commission_rate: '10.00', reserved_until: null, is_active: true }));
  db.instance = [{ id: 'shop', company_id: 'c1', user_id: null }, { id: 'private', company_id: 'c1', user_id: 's1' }];
  db.chat = [{ id: 'shop-chat', opportunity_id: 'l1', company_id: 'c1', instance_id: 'shop', client_phone: '5521999990001', client_name: 'Client one', assigned_to: 's1', status: 'interesse em compra' }, { id: 'private-chat', opportunity_id: 'l1', company_id: 'c1', instance_id: 'private', client_phone: '5521999990001', status: 'em atendimento', sector: 'sales' }];
  db.message = [{ id: 'secret', chat_id: 'shop-chat', text: 'SHOP HISTORY SECRET', sender: 'client' }];
});
async function call(userId, path, method = 'GET', body) {
  const user = db.user.find(item => item.id === userId);
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: 'Bearer ' + generateToken(user) } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
test('commercial routes reject anonymous/support and hide other sellers and tenants', async () => {
  assert.equal((await call(null, '/commercial/leads')).status, 401);
  assert.equal((await call('support', '/commercial/leads')).status, 403);
  assert.deepEqual((await call('s1', '/commercial/leads')).data.map(lead => lead.id), ['l1']);
  assert.equal((await call('a1', '/commercial/leads')).data.length, 2);
  assert.equal((await call('s1', '/commercial/leads/l2', 'PATCH', { product: 'Stolen' })).status, 404);
  assert.equal((await call('a1', '/commercial/leads/l3', 'PATCH', { product: 'Stolen' })).status, 404);
});
test('commercial linking never grants access to shop history or other connection IDs', async () => {
  const result = await call('s1', '/commercial/leads/l1/chats');
  assert.deepEqual(result.data.map(chat => chat.id), ['private-chat']);
  assert.doesNotMatch(JSON.stringify(result), /SHOP HISTORY|shop-chat/);
  assert.equal((await call('a1', '/commercial/leads/l1/chats')).data.length, 2);
});
test('phone normalization and preference persistence use a tenant-scoped allowlist', async () => {
  assert.equal(service.phoneKey('21 99999-0001'), '5521999990001'); assert.equal(service.phoneKey('anon-label'), null);
  await service.syncChat(prisma, db.chat[0], { product: 'iPhone 15', variant: '256 GB', payment: 'Boleto', purchase_confirmed: true, context: 'SHOP HISTORY SECRET', injected: 'secret' });
  assert.equal(db.opportunity[0].product, 'iPhone 15'); assert.equal(db.opportunity.length, 3);
  assert.equal(db.opportunity[0].context, undefined); assert.equal(db.opportunity[0].injected, undefined);
});
test('manual lead cannot expose an existing lead assigned to another seller', async () => {
  const result = await call('s2', '/commercial/leads', 'POST', { client_name: 'Guess', phone: '5521999990001', company_id: 'c2' });
  assert.equal(result.status, 404); assert.equal(db.opportunity[0].seller_id, 's1');
});
test('an old private chat cannot reclaim a commercially reassigned lead', async () => {
  db.opportunity[0].seller_id = 's2';
  await service.syncChat(prisma, { ...db.chat[1], assigned_to: 's1' });
  assert.equal(db.opportunity[0].seller_id, 's2');
  await service.syncChat(prisma, { ...db.chat[0], assigned_to: 's1' }, undefined, true);
  assert.equal(db.opportunity[0].seller_id, 's1');
});
test('reservations are exclusive, expire, and reject foreign lead/product links', async () => {
  const first = await call('s1', '/products/p1/reserve', 'POST', { opportunity_id: 'l1', minutes: 30 }); assert.equal(first.status, 200);
  assert.equal((await call('a1', '/products/p1/reserve', 'POST', { opportunity_id: 'l2' })).status, 409);
  assert.equal((await call('s2', '/products/p1/reserve', 'POST', { opportunity_id: 'l2' })).status, 404);
  assert.equal((await call('a1', '/products/p1/reserve', 'POST', { opportunity_id: 'l3' })).status, 404);
  db.product[0].reserved_until = new Date(Date.now() - 1000);
  assert.equal((await call('a1', '/products/p1/reserve', 'POST', { opportunity_id: 'l2', minutes: 5 })).status, 200);
});
test('a sale cannot bypass an active reservation', async () => {
  await service.reserve(db.user[1], 'p1', { opportunity_id: 'l1' });
  assert.equal((await call('a1', '/products/p1/sell', 'POST', { opportunity_id: 'l2' })).status, 409);
  assert.equal(db.product[0].status, 'stock'); assert.equal(db.sale.length, 0);
});
test('concurrent sale attempts create exactly one sale and complete lead tasks', async () => {
  db.followUpTask.push({ id: 'task', company_id: 'c1', opportunity_id: 'l1', completed_at: null });
  const results = await Promise.all([call('s1', '/products/p1/sell', 'POST', { opportunity_id: 'l1' }), call('s1', '/products/p1/sell', 'POST', { opportunity_id: 'l1' })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]); assert.equal(db.sale.length, 1);
  assert.equal(db.opportunity[0].status, 'won'); assert.ok(db.followUpTask[0].completed_at);
  assert.equal(db.saleReceipt.length, 0); // down payment is not a confirmed receipt
});
test('snapshots are fixed at sale time and costs are not exposed to sellers', async () => {
  await service.sell(db.user[1], 'p1', { opportunity_id: 'l1' }); db.product[0].cost = '1';
  assert.equal((await call('s1', '/commercial/sales')).status, 403);
  const own = (await call('s1', '/commercial/sales/operations')).data[0];
  assert.equal(own.opportunity.client_name, 'Client one');
  for (const field of ['total', 'cost', 'margin', 'received', 'balance', 'refund_due', 'commission', 'commission_rate', 'commission_earned', 'receipts']) assert.equal(own[field], undefined);
  assert.equal((await call('s2', '/commercial/sales/operations')).data.length, 0);
  assert.equal((await call('s3', '/commercial/sales/operations')).data.length, 0);
  const all = (await call('a1', '/commercial/sales')).data[0]; assert.equal(all.cost, '60.00'); assert.equal(all.margin, 30.45);
  assert.equal((await call('s1', '/products')).data.length, 0);
  const products = (await call('s2', '/products')).data; assert.equal(products[0].cost, undefined); assert.equal(products[0].supplier_name, undefined); assert.equal(products[0].commission_rate, undefined);
});
test('conversion counts real linked sales, not finalized conversations or returned products', async () => {
  db.chat[0].status = 'finalizada';
  assert.equal((await call('a1', '/commercial/summary')).data.converted, 0);
  await service.sell(db.user[1], 'p1', { opportunity_id: 'l1' });
  const all = (await call('a1', '/commercial/summary')).data; assert.equal(all.total, 2); assert.equal(all.converted, 1); assert.equal(all.conversion_rate, 50);
  assert.equal((await call('s2', '/commercial/summary')).status, 403);
  db.sale[0].status = 'returned'; assert.equal((await call('a1', '/commercial/summary')).data.converted, 0);
});
test('dates and unresolved LIDs cannot silently create invalid commercial records', async () => {
  for (const value of ['2026-02-30T10:00:00Z', '2026-01-01T24:00:00Z', 'tomorrow']) assert.throws(() => service.date(value));
  assert.equal(await service.syncChat(prisma, { ...db.chat[0], client_phone: '123456789012345', remote_jid: '123456789012345@lid' }), null);
  assert.equal(db.opportunity.length, 3);
});
test('push does not send to revoked sessions and does not disclose conversation content', async () => {
  db.user[1].session_version = 1;
  db.pushSubscription.push({ id: 'stale', company_id: 'c1', user_id: 's1', session_version: 0, endpoint: 'https://fcm.googleapis.com/test', keys: {} });
  assert.equal(await push.send('s1', 'c1', 'Novo lead'), false); assert.equal(db.pushSubscription.length, 0);
  db.pushSubscription.push({ id: 'fresh', company_id: 'c1', user_id: 's1', session_version: 1, endpoint: 'https://fcm.googleapis.com/test', keys: {} });
  const webpush = require('web-push'), original = webpush.sendNotification; const payloads = [];
  webpush.sendNotification = async (subscription, payload) => payloads.push(JSON.parse(payload));
  try { assert.equal(await push.send('s1', 'c1', 'Novo lead'), true); assert.equal(payloads.length, 1); assert.doesNotMatch(JSON.stringify(payloads), /SHOP HISTORY|5521999990001/); }
  finally { webpush.sendNotification = original; }
});
test('financial amounts are validated, bounded and idempotent', async () => {
  const sale = await service.sell(db.user[1], 'p1', { opportunity_id: 'l1' });
  const receipt = { amount: '20.25', kind: 'payment', method: 'pix', request_id: 'retry-safe' };
  assert.equal((await call('s1', `/commercial/sales/${sale.id}/receipts`, 'POST', receipt)).status, 403);
  const first = await call('a1', `/commercial/sales/${sale.id}/receipts`, 'POST', receipt); assert.equal(first.status, 201);
  const retry = await call('a1', `/commercial/sales/${sale.id}/receipts`, 'POST', receipt); assert.equal(retry.data.id, first.data.id); assert.equal(db.saleReceipt.length, 1);
  assert.equal((await call('a1', `/commercial/sales/${sale.id}/receipts`, 'POST', { ...receipt, amount: '25' })).status, 409);
  for (const amount of ['-1', '1.001', 'Infinity', '0']) assert.equal((await call('a1', `/commercial/sales/${sale.id}/receipts`, 'POST', { ...receipt, amount, request_id: amount })).status, 400);
  assert.equal((await call('a1', `/commercial/sales/${sale.id}/receipts`, 'POST', { ...receipt, amount: '100', request_id: 'overpay' })).status, 409);
  const financial = (await call('a1', '/commercial/sales')).data[0]; assert.equal(financial.received, 20.25); assert.equal(financial.balance, 80.25); assert.equal(financial.commission_earned, 2.03);
});
test('refunds cannot exceed receipts or modify another tenant sale', async () => {
  const sale = await service.sell(db.user[1], 'p1', { opportunity_id: 'l1' });
  const input = { amount: '10', kind: 'refund', method: 'pix', request_id: 'refund' };
  assert.equal((await call('a1', `/commercial/sales/${sale.id}/receipts`, 'POST', input)).status, 409);
  assert.equal((await call('s3', `/commercial/sales/${sale.id}/after-sales`, 'POST', { type: 'support', description: 'hack' })).status, 404);
});
test('return approval requires manager, cancels commission and tracks refund due without restocking', async () => {
  const sale = await service.sell(db.user[1], 'p1', { opportunity_id: 'l1' });
  await service.receipt(db.user[0], sale.id, { amount: '100.50', kind: 'payment', method: 'pix', request_id: 'payment' });
  const item = await service.afterSale(db.user[1], sale.id, { type: 'return', description: 'Customer requested return' });
  assert.equal((await call('s1', `/commercial/after-sales/${item.id}/resolve`, 'PATCH', { resolution: 'Approved', approve_return: true })).status, 403);
  assert.equal((await call('a1', `/commercial/after-sales/${item.id}/resolve`, 'PATCH', { resolution: 'Approved', approve_return: true })).status, 200);
  const financial = (await call('a1', '/commercial/sales')).data[0]; assert.equal(financial.balance, 0); assert.equal(financial.refund_due, 100.5); assert.equal(financial.commission, 0); assert.equal(db.product[0].status, 'returned'); assert.equal(db.opportunity[0].status, 'open');
});
test('loss requires reason, releases reservations and stops pending rotation', async () => {
  await service.reserve(db.user[1], 'p1', { opportunity_id: 'l1' });
  assert.equal((await call('s1', '/commercial/leads/l1', 'PATCH', { status: 'lost' })).status, 400);
  assert.equal((await call('s1', '/commercial/leads/l1', 'PATCH', { status: 'lost', lost_reason: 'Budget' })).status, 200);
  assert.equal(db.opportunity[0].status, 'lost'); assert.equal(db.product[0].reserved_until, null); assert.equal(db.chat[0].sales_reply_due_at, null);
  await service.syncChat(prisma, db.chat[0], { product: 'iPhone 13', payment: 'Pix', purchase_confirmed: true }); assert.equal(db.opportunity[0].status, 'open');
});
test('follow-up ownership and shared reply changes are enforced on the server', async () => {
  const body = { opportunity_id: 'l1', title: 'Call customer', due_at: new Date(Date.now() + 60000).toISOString() };
  assert.equal((await call('s2', '/commercial/tasks', 'POST', body)).status, 404);
  const task = await call('s1', '/commercial/tasks', 'POST', body); assert.equal(task.status, 201);
  assert.equal((await call('s2', `/commercial/tasks/${task.data.id}/complete`, 'PATCH')).status, 404);
  assert.equal((await call('s1', `/commercial/tasks/${task.data.id}/complete`, 'PATCH')).status, 200);
  assert.equal((await call('s1', '/commercial/replies', 'POST', { title: 'Hi', text: 'Hello' })).status, 403);
  const reply = await call('a1', '/commercial/replies', 'POST', { title: 'Hi', text: 'Hello' }); assert.equal(reply.status, 201);
  assert.equal((await call('s1', '/commercial/replies')).data.length, 1); assert.equal((await call('s3', '/commercial/replies')).data.length, 0);
  assert.equal((await call('s3', `/commercial/replies/${reply.data.id}`, 'DELETE')).status, 403);
});
test('push rejects private endpoints, lookalike hosts and invalid keys', () => {
  const keys = { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) };
  assert.equal(push.validateSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys }).keys.auth, keys.auth);
  for (const endpoint of ['http://fcm.googleapis.com/test', 'https://127.0.0.1/test', 'https://fcm.googleapis.com.evil.test/test', 'https://user@fcm.googleapis.com/test', 'https://fcm.googleapis.com:444/test']) assert.throws(() => push.validateSubscription({ endpoint, keys }));
  assert.throws(() => push.validateSubscription({ endpoint: 'https://fcm.googleapis.com/test', keys: { auth: 'bad', p256dh: 'bad' } }));
});
test('push subscription cannot be stolen by an active account', async () => {
  db.pushSubscription.push({ id: 'sub', company_id: 'c1', user_id: 's1', session_version: 0, endpoint: 'https://fcm.googleapis.com/fcm/send/test', keys: {} });
  const result = await call('s2', '/push/subscriptions', 'POST', { endpoint: db.pushSubscription[0].endpoint, keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) } });
  assert.equal(result.status, 409); assert.equal(db.pushSubscription[0].user_id, 's1');
  assert.equal((await call('s2', '/push/subscriptions', 'DELETE')).status, 200); assert.equal(db.pushSubscription.length, 1);
});


test('sales indicators require a stored manager role even for the sellers own sale', async () => {
  await service.sell(db.user[1], 'p1', { opportunity_id: 'l1' });
  for (const path of ['/commercial/sales', '/commercial/summary', '/products/metrics']) {
    assert.equal((await call('s1', path)).status, 403);
    if (path !== '/products/metrics') {
      assert.equal((await call('a1', path)).status, 200);
      assert.equal((await call('m1', path)).status, 200);
    }
    const forged = generateToken({ ...db.user[1], role: 'admin' });
    assert.equal((await fetch(base + path, { headers: { Authorization: 'Bearer ' + forged } })).status, 403);
  }
});

test('every new sale requires an accessible customer without partial stock changes', async () => {
  for (const user of ['s1', 'a1']) assert.equal((await call(user, '/products/p1/sell', 'POST', {})).status, 400);
  for (const lead of ['missing', 'l2', 'l3']) assert.equal((await call('s1', '/products/p1/sell', 'POST', { opportunity_id: lead })).status, 404);
  const customer = db.opportunity[0];
  for (const change of [{ client_name: '' }, { phone: 'invalid' }]) {
    Object.assign(db.opportunity[0], change);
    assert.equal((await call('s1', '/products/p1/sell', 'POST', { opportunity_id: 'l1' })).status, 400);
    Object.assign(db.opportunity[0], { client_name: customer.client_name || 'Client one', phone: '5521999990001' });
  }
  assert.equal(db.sale.length, 0); assert.equal(db.product[0].status, 'stock'); assert.equal(db.opportunity[0].status, 'open');
  const sold = await call('s1', '/products/p1/sell', 'POST', { opportunity_id: 'l1' });
  assert.equal(sold.status, 200); assert.equal(db.sale[0].opportunity_id, 'l1');
});

const catalogSale = (extra = {}) => ({ model_id: 'model1', seller_id: 's1', opportunity_id: 'l1', price: '150.25', down_payment: '10', payment_method: 'boleto', serial: '123456789012345', color: 'Azul', memory: '128 GB', condition: 'used', ...extra });
test('catalog is shared within company, manager-only editing and no seller costs or commission', async () => {
  const list = await call('s1', '/products/models');
  assert.equal(list.status, 200); assert.equal(list.data.length, 2);
  assert.ok(list.data.every(item => item.cost === undefined && item.commission_rate === undefined));
  assert.equal((await call('s1', '/products/models', 'POST', {})).status, 403);
  assert.equal((await call('s1', '/products/models/model1', 'PUT', {})).status, 403);
  assert.equal((await call('a1', '/products/models/model3', 'PUT', { name: 'Other', kind: 'phone', price: '100' })).status, 404);
  assert.equal((await call('m1', '/products/models', 'POST', { name: 'New', kind: 'phone', price: '100' })).status, 201);
  db.productModel[0].is_active = false;
  assert.equal((await call('s1', '/products/models')).data.length, 2);
});
test('one catalog product is reused across sales without consuming the product limit', async () => {
  db.company[0].max_products = 2;
  const result = await call('s1', '/products/sales', 'POST', catalogSale({ cost: '0', commission_rate: '100', company_id: 'c2' }));
  assert.equal(result.status, 201); assert.deepEqual(Object.keys(result.data).sort(), ['sale_id', 'success']);
  assert.equal(db.sale[0].total, '150.25'); assert.equal(db.sale[0].cost, '60.00'); assert.equal(db.sale[0].commission_rate, '10.00');
  assert.equal(db.product[3].model_id, 'model1'); assert.equal(db.product[3].status, 'sold'); assert.equal(db.product[3].color, 'Azul');
  db.opportunity[0].status = 'open';
  assert.equal((await call('s1', '/products/sales', 'POST', catalogSale({ serial: '123456789012346' }))).status, 201);
  assert.equal(db.productModel.length, 3); assert.equal(db.sale.length, 2);
  assert.equal((await call('s1', '/products')).data.length, 1); // only original unsold stock, never sale prices
  const operations = (await call('s1', '/commercial/sales/operations')).data;
  assert.ok(operations.every(sale => sale.total === undefined && sale.product.price === undefined));
});
test('phone validation, customer ownership and tenant checks leave no orphan unit', async () => {
  const before = db.product.length;
  for (const extra of [{ serial: '123' }, { serial: 'ABCDEFGHIJKLMNO' }, { memory: '' }, { color: '' }, { condition: 'broken' }, { down_payment: '151' }, { price: '-1' }, { seller_id: 's2' }, { opportunity_id: '' }, { opportunity_id: 'l2' }, { model_id: 'model3' }]) {
    const result = await call('s1', '/products/sales', 'POST', catalogSale(extra));
    assert.ok(result.status >= 400 && result.status < 500, JSON.stringify(extra));
    assert.equal(db.product.length, before); assert.equal(db.sale.length, 0);
  }
  assert.equal((await call('s1', '/products/sales', 'POST', catalogSale({ warranty_until: '2020-01-01T00:00:00Z' }))).status, 400);
  assert.equal(db.product.length, before);
});
test('motorcycles accept chassis and omit memory; duplicate serial cannot create two sales', async () => {
  const input = catalogSale({ model_id: 'model2', serial: 'MOTO-CHASSIS-123', memory: '' });
  const outcomes = await Promise.all([call('s1', '/products/sales', 'POST', input), call('s1', '/products/sales', 'POST', input)]);
  assert.deepEqual(outcomes.map(result => result.status).sort(), [201, 409]);
  assert.equal(db.sale.length, 1); assert.equal(db.product[3].memory, null);
  db.opportunity[0].status = 'open';
  assert.equal((await call('s1', '/products/sales', 'POST', input)).status, 409);
});
test('existing physical stock and reservations remain usable without recreating the unit', async () => {
  Object.assign(db.product[0], { model_id: 'model1', serial: '123456789012345' });
  await service.reserve(db.user[1], 'p1', { opportunity_id: 'l1' });
  const result = await call('s1', '/products/sales', 'POST', catalogSale());
  assert.equal(result.status, 201); assert.equal(db.product.length, 3); assert.equal(db.sale[0].product_id, 'p1');
});
test('catalog limits count models and inactive or foreign selections cannot record sales', async () => {
  db.company[0].max_products = 2;
  assert.equal((await call('a1', '/products/models', 'POST', { name: 'More', kind: 'phone', price: '100' })).status, 403);
  db.productModel[0].is_active = false;
  assert.equal((await call('s1', '/products/sales', 'POST', catalogSale())).status, 404);
  assert.equal(db.sale.length, 0);
  assert.equal((await call('support', '/products/sales', 'POST', catalogSale())).status, 403);
});
test('AI receives active catalog models as reference, without implying confirmed physical stock', async () => {
  const catalog = require('../src/controllers/catalogController');
  const categories = await catalog.getCatalogForAI('c1');
  const prompt = catalog.formatCatalogForPrompt(categories);
  assert.match(prompt, /iPhone 13/); assert.match(prompt, /Moto X/); assert.doesNotMatch(prompt, /Foreign/);
  assert.match(prompt, /Confirme disponibilidade, unidade e valor final/);
  db.productModel[0].is_active = false;
  assert.doesNotMatch(catalog.formatCatalogForPrompt(await catalog.getCatalogForAI('c1')), /iPhone 13/);
});
