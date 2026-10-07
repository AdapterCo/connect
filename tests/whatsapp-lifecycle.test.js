const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createLifecycle, writeFence, disconnectPolicy } = require('../src/services/whatsappLifecycleService');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('start, cleanup and reconnect serialize on one line without blocking another line', async () => {
  const lifecycle = createLifecycle(), gate = deferred(), order = [];
  const first = lifecycle.run('store', async () => { order.push('start'); await gate.promise; order.push('start-finished'); });
  const stop = lifecycle.run('store', () => order.push('cleaned'));
  const next = lifecycle.run('store', () => order.push('new-session'));
  await lifecycle.run('seller', () => order.push('seller-available'));
  assert.deepEqual(order, ['start', 'seller-available']);
  gate.resolve(); await Promise.all([first, stop, next]);
  assert.deepEqual(order, ['start', 'seller-available', 'start-finished', 'cleaned', 'new-session']);
});
test('stop invalidates pending startup and stale socket events immediately', () => {
  const lifecycle = createLifecycle(), token = lifecycle.renew('store'), seller = lifecycle.renew('seller');
  lifecycle.renew('store');
  assert.equal(lifecycle.current('store', token), false);
  assert.equal(lifecycle.current('seller', seller), true);
});
test('session cleanup waits for in-flight key writes and prevents all late writes', async () => {
  const gate = deferred(); let active = true, written = false, cleaned = false;
  const fence = writeFence(() => active);
  const write = fence.write(async () => { await gate.promise; written = true; });
  await Promise.resolve(); active = false;
  const cleanup = fence.close().then(() => { cleaned = true; });
  await fence.write(() => assert.fail('old credentials must not be written'));
  assert.equal(cleaned, false);
  gate.resolve(); await Promise.all([write, cleanup]);
  assert.equal(written, true); assert.equal(cleaned, true);
});
test('queued credential save is discarded if its session is invalidated before the write starts', async () => {
  let active = true;
  const fence = writeFence(() => active);
  const task = fence.write(() => assert.fail('invalidated session wrote credentials'));
  active = false; await task; await fence.close();
});
test('a failed operation cannot leave the instance queue permanently blocked', async () => {
  const lifecycle = createLifecycle();
  await assert.rejects(lifecycle.run('store', () => { throw new Error('failed'); }));
  assert.equal(await lifecycle.run('store', () => 'recovered'), 'recovered');
});
test('logout clears only its session; conflicting connections stop and transient failures retry', () => {
  const reasons = { loggedOut: 401, connectionReplaced: 440, forbidden: 403, multideviceMismatch: 411 };
  assert.equal(disconnectPolicy(401, reasons), 'reset');
  for (const code of [440, 403, 411]) assert.equal(disconnectPolicy(code, reasons), 'stop');
  for (const code of [408, 428, 515, undefined]) assert.equal(disconnectPolicy(code, reasons), 'retry');
});

// Exercise actual per-instance shutdown without loading or editing the custom AI.
require.cache[require.resolve('../src/services/aiService')] = { exports: {} };
require.cache[require.resolve('../src/config/database')] = { exports: { prisma: {} } };
require.cache[require.resolve('../src/config/socket')] = { exports: { emitToCompany() {} } };
const whatsapp = require('../src/services/whatsappService');
test('disconnect removes only the chosen auth directory after pending writes finish and keeps the other socket open', async () => {
  const id = 'inst_lifecycle_test_' + process.pid;
  const root = path.resolve(__dirname, '../auth_info_baileys'), folder = path.join(root, id);
  assert.ok(folder.startsWith(root + path.sep));
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'creds.json'), '{}');
  const gate = deferred(), connections = whatsapp.getActiveConnections();
  let closed = 0;
  const conn = { companyId: 'test', connectionStatus: 'open', sock: { logout: async () => {}, end: () => { closed++; }, ev: { removeAllListeners() {} } } };
  conn.authFence = writeFence(() => !conn.stopped);
  const pending = conn.authFence.write(async () => { await gate.promise; fs.writeFileSync(path.join(folder, 'session.json'), '{}'); });
  await Promise.resolve();
  const other = { connectionStatus: 'open', sock: { end: () => assert.fail('other line disconnected') } };
  connections[id] = conn; connections.inst_lifecycle_other = other;
  try {
    const shutdown = whatsapp.stopWhatsAppInstance(id, true);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(conn.stopped, true); assert.equal(fs.existsSync(folder), true);
    gate.resolve(); await Promise.all([pending, shutdown]);
    assert.ok(closed > 0); assert.equal(fs.existsSync(folder), false);
    assert.equal(connections.inst_lifecycle_other, other); assert.equal(other.connectionStatus, 'open');
    await conn.authFence.write(() => assert.fail('late write recreated removed auth folder'));
    assert.equal(fs.existsSync(folder), false);
  } finally { gate.resolve(); delete connections[id]; delete connections.inst_lifecycle_other; if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true }); }
});
test('invalid session paths cannot trigger recursive filesystem removal', async () => {
  await assert.rejects(whatsapp.stopWhatsAppInstance('../outside', true), /Identificador/);
});


test('logout failure still closes only that socket and finishes local session cleanup', async () => {
  const id = 'inst_lifecycle_failure_' + process.pid;
  const root = path.resolve(__dirname, '../auth_info_baileys'), folder = path.join(root, id);
  assert.ok(folder.startsWith(root + path.sep)); fs.mkdirSync(folder, { recursive: true });
  const connections = whatsapp.getActiveConnections(); let closed = false;
  connections[id] = { companyId: 'test', sock: { logout: async () => { throw new Error('socket already closed'); }, end: () => { closed = true; } } };
  try {
    await whatsapp.stopWhatsAppInstance(id, true);
    assert.equal(closed, true); assert.equal(connections[id], undefined); assert.equal(fs.existsSync(folder), false);
  } finally { delete connections[id]; if (fs.existsSync(folder)) fs.rmSync(folder, { recursive: true }); }
});
