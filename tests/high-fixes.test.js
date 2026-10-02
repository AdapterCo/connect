const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { once } = require('node:events');
const { db, reset, install } = require('./helpers/memory-prisma');
install();

require.cache[require.resolve('../src/services/whatsappService')] = {
  exports: { getActiveConnections: () => ({}), startWhatsAppInstance: async () => {}, stopWhatsAppInstance: async () => {} }
};

const { generateToken } = require('../src/config/auth');
const { passwordError } = require('../src/middleware/validationMiddleware');
const { normalizePaymentCopy, conversationHistory, humanAttendanceContext } = require('../src/services/aiService');
const app = require('../app');

let server, base;
test.before(async () => { server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise(resolve => server.close(resolve)));

async function seed() {
  reset();
  db.company.push({ id: 'c1', is_active: true, expires_at: null, max_users: 5 });
  const password = await bcrypt.hash('senha-123', 4);
  for (const [id, role] of [['a1', 'admin'], ['m1', 'supervisor'], ['s1', 'seller']]) {
    db.user.push({ id, role, company_id: 'c1', name: id, username: id, status: 'offline', session_version: 0, password });
  }
}

async function call(url, { method = 'GET', body, user, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = 'Bearer ' + generateToken({ ...db.user.find(u => u.id === user), session_version: 0 });
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
}

test('password policy requires 8 to 128 characters', () => {
  assert.ok(passwordError('1234567'));
  assert.equal(passwordError('12345678'), null);
  assert.ok(passwordError('x'.repeat(129)));
  assert.ok(passwordError(undefined));
});

test('login sets an HttpOnly session cookie and never returns the token', async () => {
  await seed();
  const res = await call('/api/auth/login', { method: 'POST', body: { username: 'a1', password: 'senha-123' } });
  assert.equal(res.status, 200);
  assert.equal(res.body.token, undefined);
  const setCookie = res.headers.get('set-cookie');
  assert.match(setCookie, /crm_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);

  const cookie = setCookie.split(';')[0];
  const me = await call('/api/auth/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.id, 'a1');

  const logout = await call('/api/auth/logout', { method: 'POST', cookie });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /crm_session=;/);
});

test('logout clears the cookie even when the session already expired', async () => {
  await seed();
  const res = await call('/api/auth/logout', { method: 'POST', cookie: 'crm_session=invalido' });
  assert.equal(res.status, 403);
  assert.match(res.headers.get('set-cookie'), /crm_session=;/);
});

test('wrong password and unknown user get the same answer', async () => {
  await seed();
  const wrong = await call('/api/auth/login', { method: 'POST', body: { username: 'a1', password: 'errada-123' } });
  const unknown = await call('/api/auth/login', { method: 'POST', body: { username: 'ninguem', password: 'errada-123' } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, unknown.body);
});

test('only admins manage the company subscription', async () => {
  await seed();
  for (const user of ['s1', 'm1']) {
    assert.equal((await call('/api/billing/cancel', { method: 'POST', user })).status, 403);
    assert.equal((await call('/api/billing/subscribe', { method: 'POST', user, body: { planId: 'p1' } })).status, 403);
    assert.equal((await call('/api/billing/invoices', { user })).status, 403);
  }
  // Erro de regra de negocio chega ao usuario; o admin passa pela autorizacao.
  const res = await call('/api/billing/cancel', { method: 'POST', user: 'a1' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Nenhuma assinatura ativa encontrada');
});

test('internal billing errors are not exposed', async () => {
  await seed();
  const original = db.invoice;
  Object.defineProperty(db, 'invoice', { get() { throw new Error('segredo interno do banco'); }, configurable: true });
  try {
    const res = await call('/api/billing/invoices', { user: 'a1' });
    assert.equal(res.status, 500);
    assert.doesNotMatch(JSON.stringify(res.body), /segredo/);
  } finally {
    Object.defineProperty(db, 'invoice', { value: original, writable: true, configurable: true, enumerable: true });
  }
});

test('password reset stores only a hash and a token works once', async () => {
  await seed();
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  db.passwordResetToken.push({ id: 't1', user_id: 's1', token: hash, used: false, expires_at: new Date(Date.now() + 60_000) });

  assert.equal((await call('/api/password-reset/reset', { method: 'POST', body: { token: hash, newPassword: 'nova-senha' } })).status, 400,
    'o hash salvo no banco nao funciona como token');
  assert.equal((await call('/api/password-reset/reset', { method: 'POST', body: { token, newPassword: 'curta' } })).status, 400);
  assert.equal((await call('/api/password-reset/reset', { method: 'POST', body: { token, newPassword: 'nova-senha' } })).status, 200);
  assert.ok(await bcrypt.compare('nova-senha', db.user.find(u => u.id === 's1').password));
  assert.equal((await call('/api/password-reset/reset', { method: 'POST', body: { token, newPassword: 'outra-senha' } })).status, 400);
});

test('AI status defaults to the first stage and handoff flag is kept', () => {
  assert.deepEqual(normalizePaymentCopy({ message: 'Oi', status: 'qualquer' }), { message: 'Oi', status: 'iniciada', disable_ai: false });
  assert.equal(normalizePaymentCopy({ message: 'Oi', status: 'interesse em compra' }).status, 'interesse em compra');
  assert.equal(normalizePaymentCopy({ message: 'Vou chamar alguem', disable_ai: true }).disable_ai, true);
  assert.equal(normalizePaymentCopy({ message: 'Ok', status: 'transbordo' }).disable_ai, true);
  assert.equal(normalizePaymentCopy({ message: 'Vou encaminhar', request_human: true }).disable_ai, true);
});

test('AI receives attendance state and instructions to keep answering without repeating a transfer', () => {
  assert.equal(humanAttendanceContext({ status: 'iniciada' }), '');
  const assigned = humanAttendanceContext({ status: 'interesse em compra', assigned_to: 's1' });
  assert.match(assigned, /JA foi encaminhado/);
  assert.match(assigned, /Continue respondendo duvidas gerais/);
  assert.match(assigned, /nao troque o vendedor/);
  assert.match(assigned, /IA permanece ativa/);
  const waiting = humanAttendanceContext({ status: 'interesse em compra', assigned_to: null });
  assert.match(waiting, /JA esta na fila/);
  assert.match(waiting, /peca para aguardar/);
});

test('AI history excludes internal notes and does not repeat the last message', () => {
  const chat = { messages: [
    { sender: 'client', text: 'Quero uma moto' },
    { sender: 'attendant', text: 'Cliente devedor, nao vender a prazo', is_note: true },
    { sender: 'system', text: 'IA desativada' },
    { sender: 'attendant', text: 'Temos varias opcoes' },
    { sender: 'client', text: 'Qual o preco?' }
  ] };
  const history = conversationHistory(chat, 'Qual o preco?');
  assert.deepEqual(history.map(m => m.role), ['user', 'assistant', 'user']);
  assert.ok(!history.some(m => m.content.includes('devedor')));
});
