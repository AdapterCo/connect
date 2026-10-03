const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
process.env.JWT_SECRET = 'test-only-secret-'.repeat(3);
process.env.ENCRYPTION_KEY = 'test-only-key-'.repeat(3);
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
const users = [
  { id: 's1', name: 'Seller 1', company_id: 'c1', role: 'seller' },
  { id: 's2', name: 'Seller 2', company_id: 'c1', role: 'seller' },
  { id: 's3', name: 'Other company', company_id: 'c2', role: 'seller' },
  { id: 'a1', name: 'Admin', company_id: 'c1', role: 'admin' },
  { id: 'm1', name: 'Supervisor', company_id: 'c1', role: 'supervisor' },
  { id: 'x1', name: 'Support', company_id: 'c1', role: 'support' }
];
let products = [];
let queue = Promise.resolve();
const match = (row, where) => Object.entries(where).every(([key, value]) => typeof value === 'object' && value !== null ? (value.not === null ? row[key] != null : true) && (value.equals ? row[key] === value.equals : true) : row[key] === value);
const prisma = {
  company: { findUnique: async () => ({ is_active: true, max_products: 100 }) },
  category: { upsert: async () => ({ id: 'category' }) },
  $transaction: fn => { const result = queue.then(() => fn(prisma)); queue = result.catch(() => {}); return result; },
  $queryRaw: async () => [{ id: 'c1' }],
  sale: { create: async ({ data }) => ({ id: 'sale-1', ...data }) },
  opportunity: { findFirst: async ({ where }) => { const lead = { id: 'l1', seller_id: 's1', company_id: 'c1', status: 'open', client_name: 'Client', phone: '5521999990001' }; return match(lead, where) ? lead : null; }, update: async ({ data }) => data },
  followUpTask: { updateMany: async () => ({ count: 0 }) },
  auditLog: { create: async ({ data }) => data },
  user: { findFirst: async ({ where }) => users.find(u => match(u, where)), findMany: async ({ where }) => users.filter(u => match(u, where)).map(({ id, name }) => ({ id, name })) },
  product: {
    findFirst: async ({ where }) => products.find(p => match(p, where)),
    update: async ({ where, data }) => Object.assign(products.find(p => match(p, where)), data),
    count: async ({ where }) => products.filter(p => match(p, where)).length,
    findMany: async ({ where }) => products.filter(p => match(p, where)),
    create: async ({ data }) => { if (products.some(p => p.company_id === data.company_id && p.serial === data.serial)) throw Object.assign(new Error(), { code: 'P2002' }); const p = { ...data, id: String(products.length + 1), status: 'stock', sold_at: null }; products.push(p); return p; },
    updateMany: async ({ where, data }) => { const rows = products.filter(p => match(p, where)); rows.forEach(p => Object.assign(p, data)); return { count: rows.length }; },
    groupBy: async ({ where }) => { const rows = products.filter(p => match(p, where)); const ids = [...new Set(rows.map(p => p.seller_id))]; return ids.map(seller_id => { const selected = rows.filter(p => p.seller_id === seller_id); return { seller_id, _count: { _all: selected.length }, _sum: { price: selected.reduce((n, p) => n + Number(p.price), 0), down_payment: selected.reduce((n, p) => n + Number(p.down_payment), 0) } }; }); }
  }
};
require.cache[require.resolve('../src/config/database')] = { exports: { prisma } };
const { generateToken } = require('../src/config/auth');
const router = require('../src/routes/productRoutes');
const app = express(); app.use(express.json()); app.use('/api/products', router);
let server, base;
test.before(async () => { server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}/api/products`; });
test.after(() => new Promise(resolve => server.close(resolve)));
async function call(userId, url = '', method = 'GET', body) {
  const user = users.find(u => u.id === userId);
  const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: 'Bearer ' + generateToken(user) } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
const product = seller_id => ({ name: 'Phone', serial: seller_id, color: 'Black', condition: 'new', price: '100.50', down_payment: '20.00', payment_method: 'pix', seller_id });
test('HTTP rejects anonymous and non-sales roles', async () => { assert.equal((await call(null)).status, 401); assert.equal((await call('x1')).status, 403); });
test('HTTP tenant, ownership, sale lifecycle and aggregate isolation', async () => {
  assert.equal((await call('s1', '', 'POST', product('s2'))).status, 403);
  assert.equal((await call('a1', '', 'POST', product('s3'))).status, 400);
  const p1 = await call('a1', '', 'POST', product('s1')); assert.equal(p1.status, 201);
  assert.equal((await call('a1', '', 'POST', product('s1'))).status, 409);
  await call('a1', '', 'POST', product('s2'));
  assert.equal((await call('s1')).data.length, 1); assert.equal((await call('a1')).data.length, 2); assert.equal((await call('m1')).data.length, 2);
  assert.equal((await call('s2', '/' + p1.data.id + '/sell', 'POST')).status, 409);
  assert.equal((await call('s1', '/' + p1.data.id + '/sell', 'POST')).status, 400);
  const results = await Promise.all([call('s1', '/' + p1.data.id + '/sell', 'POST', { opportunity_id: 'l1' }), call('s1', '/' + p1.data.id + '/sell', 'POST', { opportunity_id: 'l1' })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await call('s1', '/' + p1.data.id, 'PUT', product('s1'))).status, 403);
  assert.equal((await call('a1', '/' + p1.data.id, 'PUT', product('s1'))).status, 409);
  assert.equal((await call('s1')).data.length, 0);
  assert.equal((await call('s1', '/metrics')).status, 403);
  assert.equal((await call('s2', '/metrics')).status, 403);
  const admin = (await call('a1', '/metrics')).data; assert.equal(admin.reduce((n, row) => n + row.total, 0), 100.5);
  const all = (await call('m1', '/metrics')).data; assert.equal(all.length, 2); assert.equal(all.reduce((n, row) => n + row.total, 0), 100.5);
  const sellers = (await call('s1', '/sellers')).data; assert.deepEqual(sellers.map(s => s.id), ['s1', 's2']); assert.ok(sellers.every(s => !('password' in s)));
});
test('HTTP ignores forged JWT role and deleted accounts', async () => {
  const forged = generateToken({ ...users[0], role: 'admin' });
  const res = await fetch(base, { headers: { Authorization: 'Bearer ' + forged } }); assert.equal((await res.json()).length, 0);
  assert.equal((await fetch(base + '/metrics', { headers: { Authorization: 'Bearer ' + forged } })).status, 403);
  const removed = generateToken({ id: 'deleted', company_id: 'c1', role: 'admin' });
  assert.equal((await fetch(base, { headers: { Authorization: 'Bearer ' + removed } })).status, 401);
});
