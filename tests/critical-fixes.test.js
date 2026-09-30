const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { once } = require('node:events');
const { db, reset, install } = require('./helpers/memory-prisma');
install();
delete process.env.SUPERADMIN_PASSWORD;
process.env.PLATFORM_MP_ACCESS_TOKEN = 'TEST-token';

let activeConnections = {};
require.cache[require.resolve('../src/services/whatsappService')] = {
  exports: { getActiveConnections: () => activeConnections, startWhatsAppInstance: async () => {}, stopWhatsAppInstance: async () => {} }
};

const { initializeDatabase } = require('../src/config/database');
const { generateToken } = require('../src/config/auth');
const billingService = require('../src/services/billingService');
const app = require('../app');

let server, base;
test.before(async () => { server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise(resolve => server.close(resolve)));

function seedTenant() {
  reset();
  db.company.push({ id: 'c1', is_active: true, expires_at: null, max_instances: 5, max_users: 5 });
  db.company.push({ id: 'comp_default', is_active: true, expires_at: null });
  for (const [id, role, company_id] of [['a1', 'admin', 'c1'], ['m1', 'supervisor', 'c1'], ['s1', 'seller', 'c1'], ['sa', 'superadmin', 'comp_default']]) {
    db.user.push({ id, role, company_id, name: id, username: id, session_version: 0 });
  }
  db.plan.push({ id: 'p1', name: 'Essencial', price: 99, is_active: true });
  db.instance.push({ id: 'inst1', name: 'Loja', company_id: 'c1', status: 'disconnected' });
}

async function call(userId, url, method = 'GET', body) {
  const user = db.user.find(u => u.id === userId);
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = 'Bearer ' + generateToken({ ...user, session_version: 0 });
  const response = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
}

test('report router no longer blocks public billing, superadmin and non-manager routes', async () => {
  seedTenant();
  assert.equal((await call(null, '/api/billing/plans')).status, 200);
  assert.equal((await call('sa', '/api/superadmin/plans')).status, 200);
  assert.notEqual((await call('s1', '/api/company/plan-info')).status, 403);
  // Relatorios continuam restritos a gestores.
  assert.equal((await call('s1', '/api/logs')).status, 403);
  assert.equal((await call(null, '/api/logs')).status, 401);
  assert.equal((await call('a1', '/api/logs')).status, 200);
});

test('billing webhook endpoint no longer exists', async () => {
  seedTenant();
  const res = await call(null, '/api/billing/webhook/billing', 'POST', { type: 'payment', data: { id: '1', status: 'approved' } });
  assert.equal(res.status, 404);
});

test('superadmin tokens are checked against the database and revocable', async () => {
  seedTenant();
  assert.equal((await call('a1', '/api/superadmin/plans')).status, 403);
  db.user.find(u => u.id === 'sa').session_version = 1;
  assert.equal((await call('sa', '/api/superadmin/plans')).status, 401);
});

test('only managers manage WhatsApp instances and see the QR code', async () => {
  seedTenant();
  activeConnections = { inst1: { connectionStatus: 'qr', qrCodeImage: 'data:image/png;base64,QR' } };
  assert.equal((await call('s1', '/api/instances', 'POST', { name: 'X' })).status, 403);
  assert.equal((await call('s1', '/api/instances/inst1/connect', 'POST')).status, 403);
  assert.equal((await call('s1', '/api/instances/inst1/disconnect', 'POST')).status, 403);
  assert.equal((await call('s1', '/api/instances/inst1', 'DELETE')).status, 403);
  assert.equal((await call('m1', '/api/instances/inst1', 'DELETE')).status, 403);
  assert.equal((await call('s1', '/api/instances')).body[0].qr, null);
  assert.equal((await call('m1', '/api/instances')).body[0].qr, 'data:image/png;base64,QR');
  assert.equal((await call('m1', '/api/instances/inst1/connect', 'POST')).status, 200);
  assert.equal((await call('a1', '/api/instances/inst1', 'DELETE')).status, 200);
});

function mockMercadoPago(payment) {
  const realFetch = global.fetch;
  global.fetch = async (url, options) => String(url).startsWith('https://api.mercadopago.com/')
    ? { ok: true, status: 200, json: async () => payment }
    : realFetch(url, options);
  return () => { global.fetch = realFetch; };
}

function seedInvoice() {
  seedTenant();
  db.plan[0].max_instances = 1;
  // O plano vem embutido para simular findUnique com include: { plan: true }.
  db.subscription.push({ id: 'sub1', company_id: 'c1', plan_id: 'p1', status: 'pending', plan: db.plan[0] });
  db.invoice.push({ id: 'inv1', company_id: 'c1', subscription_id: 'sub1', amount: 99, status: 'pending', mp_payment_id: '555' });
}

test('payment is confirmed only from the Mercado Pago API, matching reference and amount', async () => {
  seedInvoice();
  let restore = mockMercadoPago({ id: 555, status: 'approved', external_reference: 'inv1', transaction_amount: 1 });
  try { await billingService.confirmPayment('555'); } finally { restore(); }
  assert.equal(db.invoice[0].status, 'pending', 'valor divergente nao libera acesso');

  restore = mockMercadoPago({ id: 555, status: 'approved', external_reference: 'outra', transaction_amount: 99 });
  try { await billingService.confirmPayment('555'); } finally { restore(); }
  assert.equal(db.invoice[0].status, 'pending', 'referencia divergente nao libera acesso');

  restore = mockMercadoPago({ id: 555, status: 'approved', external_reference: 'inv1', transaction_amount: 99 });
  try {
    await billingService.confirmPayment('555');
    const company = db.company.find(c => c.id === 'c1');
    assert.equal(db.invoice[0].status, 'paid');
    assert.ok(company.expires_at instanceof Date);
    company.expires_at = 'sentinel';
    await billingService.confirmPayment('555');
    assert.equal(company.expires_at, 'sentinel', 'confirmacao repetida nao renova de novo');
  } finally { restore(); }
});

test('payment confirmation fails closed without Mercado Pago credentials', async () => {
  seedInvoice();
  const token = process.env.PLATFORM_MP_ACCESS_TOKEN;
  delete process.env.PLATFORM_MP_ACCESS_TOKEN;
  try { await assert.rejects(billingService.confirmPayment('555')); }
  finally { process.env.PLATFORM_MP_ACCESS_TOKEN = token; }
  assert.equal(db.invoice[0].status, 'pending');
});

test('seed creates no hardcoded accounts and never overwrites plans', async () => {
  reset();
  await initializeDatabase();
  assert.equal(db.user.length, 0);
  assert.ok(db.plan.length === 3 && db.plan.every(p => p.is_active === false && p.price === 0));

  db.plan[0].price = 149;
  db.plan[0].is_active = true;
  await initializeDatabase();
  assert.equal(db.plan[0].price, 149);
  assert.equal(db.plan[0].is_active, true);
});

test('seed creates superadmin from env and locks legacy default passwords', async () => {
  reset();
  process.env.SUPERADMIN_PASSWORD = 'uma-senha-forte-123';
  try {
    await initializeDatabase();
    const sa = db.user.find(u => u.role === 'superadmin');
    assert.ok(await bcrypt.compare('uma-senha-forte-123', sa.password));

    // Instalacao antiga: superadmin e admin com as senhas padrao do seed anterior.
    sa.password = await bcrypt.hash('superadmin123', 4);
    db.user.push({ id: 'usr_admin', username: 'admin', role: 'admin', company_id: 'comp_default', session_version: 0, password: await bcrypt.hash('admin123', 4) });
    await initializeDatabase();
    assert.ok(await bcrypt.compare('uma-senha-forte-123', sa.password));
    assert.equal(sa.session_version, 1);

    delete process.env.SUPERADMIN_PASSWORD;
    sa.password = await bcrypt.hash('superadmin123', 4);
    await initializeDatabase();
    const admin = db.user.find(u => u.id === 'usr_admin');
    assert.equal(await bcrypt.compare('superadmin123', sa.password), false);
    assert.equal(await bcrypt.compare('admin123', admin.password), false);
    assert.equal(admin.session_version, 1);
  } finally { delete process.env.SUPERADMIN_PASSWORD; }
});
