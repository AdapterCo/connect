const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { once } = require('node:events');
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-uploads-'));
process.env.UPLOAD_DIR = uploadDir;
const { db, reset, install } = require('./helpers/memory-prisma');
install();

require.cache[require.resolve('../src/services/whatsappService')] = {
  exports: { getActiveConnections: () => ({}), startWhatsAppInstance: async () => {}, stopWhatsAppInstance: async () => {} }
};

const { generateToken } = require('../src/config/auth');
const { markOfflineIfDisconnected } = require('../src/config/socket');
const { removeChatMedia } = require('../src/utils/media');
const app = require('../app');

let server, base;
test.before(async () => { server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { fs.rmSync(uploadDir, { recursive: true, force: true }); return new Promise(resolve => server.close(resolve)); });

function seed() {
  reset();
  db.company.push({ id: 'c1', is_active: true, expires_at: null });
  for (const [id, role] of [['a1', 'admin'], ['s1', 'seller']]) {
    db.user.push({ id, role, company_id: 'c1', name: id, username: id, status: 'online', session_version: 0 });
  }
  db.chat.push({ id: 'chat1', company_id: 'c1', assigned_to: 's1', client_name: 'Cliente', tags: [], messages: [] });
}

async function call(user, url, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = 'Bearer ' + generateToken({ ...db.user.find(u => u.id === user), session_version: 0 });
  const response = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
}

test('health reports the database state', async () => {
  seed();
  const res = await call(null, '/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.database, 'ok');
});

test('users without an open connection are marked offline', async () => {
  seed();
  await markOfflineIfDisconnected({ id: 's1', company_id: 'c1' });
  assert.equal(db.user.find(u => u.id === 's1').status, 'offline');
});

test('no profile can permanently delete a conversation through chat or privacy APIs', async () => {
  seed();
  for (const user of ['s1', 'a1']) {
    assert.equal((await call(user, '/api/chats/chat1', 'DELETE')).status, 403);
    assert.equal((await call(user, '/api/privacy/clients/chat1', 'DELETE')).status, 403);
  }
  assert.equal(db.chat.length, 1);
});

test('manual chat creation only accepts individual phone numbers', async () => {
  seed();
  for (const phone of ['123', '120363000000000000@g.us', 'status@broadcast', '1'.repeat(16)]) {
    assert.equal((await call('a1', '/api/chats', 'POST', { name: 'Grupo', phone })).status, 400, phone);
  }
  assert.equal((await call('a1', '/api/chats', 'POST', { name: { $ne: 1 }, phone: '5511999999999' })).status, 400);
});

test('messages, schedules and tags reject malformed input', async () => {
  seed();
  assert.equal((await call('a1', '/api/chats/chat1/message', 'POST', { text: { x: 1 } })).status, 400);
  assert.equal((await call('a1', '/api/chats/chat1/message', 'POST', { mediaUrl: '/uploads/a.jpg', mediaType: 'script' })).status, 400);
  assert.equal((await call('a1', '/api/chats/chat1/message', 'POST', { text: 'x'.repeat(5001) })).status, 400);
  const nextYear = new Date(Date.now() + 400 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal((await call('a1', '/api/chats/chat1/schedule', 'POST', { text: 'oi', scheduledTime: nextYear })).status, 400);
  assert.equal((await call('a1', '/api/chats/chat1/tags', 'POST', { tag: 'x'.repeat(41) })).status, 400);
  assert.equal((await call('a1', '/api/chats/chat1/tags', 'POST', { tag: ['a'] })).status, 400);
});

test('AI settings validate types and prompt size', async () => {
  seed();
  assert.equal((await call('a1', '/api/settings', 'POST', { ai_enabled: 'false' })).status, 400);
  assert.equal((await call('a1', '/api/settings', 'POST', { system_prompt: 'x'.repeat(120001) })).status, 400);
  assert.equal((await call('a1', '/api/settings', 'POST', { system_prompt: 'x'.repeat(120000) })).status, 200);
  assert.equal((await call('a1', '/api/settings', 'POST', { openai_key: { key: 1 } })).status, 400);
});

test('removing a conversation media keeps files shared with other conversations', async () => {
  seed();
  fs.writeFileSync(path.join(uploadDir, 'own_file.jpg'), 'a');
  fs.writeFileSync(path.join(uploadDir, 'shared_file.jpg'), 'b');
  db.message.push(
    { id: 'm1', chat_id: 'chat1', media_url: '/uploads/own_file.jpg' },
    { id: 'm2', chat_id: 'chat1', media_url: '/uploads/shared_file.jpg' },
    { id: 'm3', chat_id: 'chat2', media_url: '/uploads/shared_file.jpg' },
    { id: 'm4', chat_id: 'chat1', media_url: '/uploads/../../etc/passwd' }
  );
  assert.equal(await removeChatMedia('chat1'), 1);
  assert.equal(fs.existsSync(path.join(uploadDir, 'own_file.jpg')), false);
  assert.equal(fs.existsSync(path.join(uploadDir, 'shared_file.jpg')), true);
});
