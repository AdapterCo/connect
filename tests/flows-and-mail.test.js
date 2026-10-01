const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { once } = require('node:events');
const { db, reset, install } = require('./helpers/memory-prisma');
install();
process.env.APP_URL = 'https://painel.exemplo.com';

require.cache[require.resolve('../src/services/whatsappService')] = {
  exports: { getActiveConnections: () => ({}), startWhatsAppInstance: async () => {}, stopWhatsAppInstance: async () => {} }
};

const { generateToken } = require('../src/config/auth');
const flowService = require('../src/services/flowService');
const mailService = require('../src/services/mailService');
const app = require('../app');

let server, base;
test.before(async () => { server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise(resolve => server.close(resolve)));

function seed() {
  reset();
  db.company.push({ id: 'c1', is_active: true, expires_at: null });
  for (const [id, role, email] of [['a1', 'admin', 'admin@loja.com'], ['m1', 'supervisor', null], ['s1', 'seller', null]]) {
    db.user.push({ id, role, company_id: 'c1', name: id, username: id, email, status: 'online', session_version: 0 });
  }
}

async function call(user, url, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = 'Bearer ' + generateToken({ ...db.user.find(u => u.id === user), session_version: 0 });
  const response = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => null) };
}

// Inicio -> Mensagem -> Pergunta(nome) -> Menu(interesse)
//   Comprar -> Pergunta(email, tipo e-mail) -> Transferencia (rodizio)
//   Suporte -> Encerramento
const sampleGraph = () => ({
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {}, selected: true },
    { id: 'hello', type: 'message', position: { x: 0, y: 100 }, data: { text: 'Olá, {{cliente}}!' } },
    { id: 'name', type: 'question', position: { x: 0, y: 200 }, data: { text: 'Qual é o seu nome?', variable: 'nome', input: 'text' } },
    { id: 'menu', type: 'menu', position: { x: 0, y: 300 }, data: { text: '{{nome}}, como podemos ajudar?', variable: 'interesse', invalid_text: 'Escolha uma opção.', options: [{ id: 'buy', label: 'Comprar' }, { id: 'help', label: 'Suporte' }] } },
    { id: 'email', type: 'question', position: { x: 0, y: 400 }, data: { text: 'Qual o seu e-mail?', variable: 'email', input: 'email' } },
    { id: 'sales', type: 'transfer', position: { x: 0, y: 500 }, data: { text: 'Um vendedor já vai falar com você.', to_sales: true } },
    { id: 'bye', type: 'end', position: { x: 200, y: 400 }, data: { text: 'Obrigado, {{nome}}!' } }
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'hello' },
    { id: 'e2', source: 'hello', target: 'name' },
    { id: 'e3', source: 'name', target: 'menu' },
    { id: 'e4', source: 'menu', sourceHandle: 'buy', target: 'email' },
    { id: 'e5', source: 'menu', sourceHandle: 'help', target: 'bye' },
    { id: 'e6', source: 'email', target: 'sales' }
  ]
});

function recorder() {
  const sent = [];
  const transfers = [];
  return { sent, transfers, actions: { send: async text => { sent.push(text); }, transfer: async options => { transfers.push(options); } } };
}

test('graph validation normalizes nodes and rejects invalid designs', () => {
  const graph = flowService.validateGraph(sampleGraph());
  assert.equal(graph.nodes[0].selected, undefined, 'campos do editor nao sao salvos');
  assert.equal(graph.edges.length, 6);

  const twoStarts = sampleGraph(); twoStarts.nodes.push({ id: 'start2', type: 'start', position: {}, data: {} });
  assert.throws(() => flowService.validateGraph(twoStarts), /exatamente um nó de Início/);

  const badVariable = sampleGraph(); badVariable.nodes[2].data.variable = '1 nome';
  assert.throws(() => flowService.validateGraph(badVariable), /variável/);

  const badHandle = sampleGraph(); badHandle.edges.push({ id: 'x', source: 'menu', sourceHandle: 'nope', target: 'bye' });
  assert.throws(() => flowService.validateGraph(badHandle), /saída inválida/);

  const duplicated = sampleGraph(); duplicated.edges.push({ id: 'x', source: 'hello', target: 'bye' });
  assert.throws(() => flowService.validateGraph(duplicated), /apenas uma ligação/);

  const script = sampleGraph(); script.nodes.push({ id: 'evil', type: 'script', position: {}, data: {} });
  assert.throws(() => flowService.validateGraph(script), /tipo de nó desconhecido/);
});

test('flow collects answers, retries invalid input and transfers to sales', async () => {
  seed();
  db.flow.push({ id: 'f1', company_id: 'c1', name: 'Captação', is_active: true, graph: flowService.validateGraph(sampleGraph()) });
  const chat = { id: 'chat1', company_id: 'c1', client_name: 'Maria' };
  const { sent, transfers, actions } = recorder();

  assert.equal(await flowService.handleIncoming({ chat, message: 'oi', isNewChat: true, actions }), true);
  assert.deepEqual(sent, ['Olá, Maria!', 'Qual é o seu nome?']);

  await flowService.handleIncoming({ chat, message: 'Ana', isNewChat: false, actions });
  assert.equal(sent.at(-1), 'Ana, como podemos ajudar?\n\n1. Comprar\n2. Suporte');

  await flowService.handleIncoming({ chat, message: 'talvez', isNewChat: false, actions });
  assert.match(sent.at(-1), /^Escolha uma opção\.\n\nAna, como podemos ajudar\?/);

  await flowService.handleIncoming({ chat, message: '1', isNewChat: false, actions });
  assert.equal(sent.at(-1), 'Qual o seu e-mail?');

  await flowService.handleIncoming({ chat, message: 'nao sei', isNewChat: false, actions });
  assert.match(sent.at(-1), /Não entendi/);

  await flowService.handleIncoming({ chat, message: 'Ana@Exemplo.com', isNewChat: false, actions });
  assert.equal(sent.at(-1), 'Um vendedor já vai falar com você.');
  assert.deepEqual(transfers, [{ toSales: true }]);

  const session = db.flowSession.find(s => s.chat_id === 'chat1');
  assert.equal(session.status, 'transferred');
  assert.deepEqual(session.variables, { nome: 'Ana', interesse: 'Comprar', email: 'ana@exemplo.com' });

  // Fluxo concluido: as proximas mensagens ficam com a IA/atendente.
  assert.equal(await flowService.handleIncoming({ chat, message: 'oi de novo', isNewChat: false, actions }), false);
});

test('menu accepts the option text, flow ends and only starts on new chats', async () => {
  seed();
  db.flow.push({ id: 'f1', company_id: 'c1', name: 'Captação', is_active: true, graph: flowService.validateGraph(sampleGraph()) });
  const { sent, actions } = recorder();

  assert.equal(await flowService.handleIncoming({ chat: { id: 'old', company_id: 'c1', client_name: 'X' }, message: 'oi', isNewChat: false, actions }), false);

  const chat = { id: 'chat2', company_id: 'c1', client_name: 'João' };
  await flowService.handleIncoming({ chat, message: 'oi', isNewChat: true, actions });
  await flowService.handleIncoming({ chat, message: 'João', isNewChat: false, actions });
  await flowService.handleIncoming({ chat, message: 'suporte', isNewChat: false, actions });
  assert.equal(sent.at(-1), 'Obrigado, João!');
  assert.equal(db.flowSession.find(s => s.chat_id === 'chat2').status, 'finished');
});

test('three invalid answers hand the conversation to a human', async () => {
  seed();
  db.flow.push({ id: 'f1', company_id: 'c1', name: 'Captação', is_active: true, graph: flowService.validateGraph(sampleGraph()) });
  const chat = { id: 'chat3', company_id: 'c1', client_name: 'Lia' };
  const { transfers, actions } = recorder();
  await flowService.handleIncoming({ chat, message: 'oi', isNewChat: true, actions });
  await flowService.handleIncoming({ chat, message: 'Lia', isNewChat: false, actions });
  for (const answer of ['a', 'b', 'c']) await flowService.handleIncoming({ chat, message: answer, isNewChat: false, actions });
  assert.deepEqual(transfers, [{ toSales: false }]);
  assert.equal(db.flowSession.find(s => s.chat_id === 'chat3').status, 'transferred');
});

test('a human reply stops the flow', async () => {
  seed();
  db.flowSession.push({ id: 's1', chat_id: 'chat4', company_id: 'c1', flow_id: 'f1', status: 'active', variables: {} });
  await flowService.cancelForHuman('chat4');
  assert.equal(db.flowSession[0].status, 'cancelled');
});

test('only managers manage flows; activation is validated and exclusive', async () => {
  seed();
  assert.equal((await call('s1', '/api/flows')).status, 403);

  const created = await call('m1', '/api/flows', 'POST', { name: 'Captação' });
  assert.equal(created.status, 201);
  const id = created.body.id;

  assert.equal((await call('m1', `/api/flows/${id}/active`, 'POST', { active: true })).status, 400, 'Início sem ligação');
  assert.equal((await call('m1', `/api/flows/${id}`, 'PUT', { graph: { nodes: [], edges: [] } })).status, 400);
  assert.equal((await call('m1', `/api/flows/${id}`, 'PUT', { graph: sampleGraph() })).status, 200);
  assert.equal((await call('m1', `/api/flows/${id}/active`, 'POST', { active: true })).status, 200);

  const other = await call('a1', '/api/flows', 'POST', { name: 'Outro' });
  await call('a1', `/api/flows/${other.body.id}`, 'PUT', { graph: sampleGraph() });
  await call('a1', `/api/flows/${other.body.id}/active`, 'POST', { active: true });
  assert.deepEqual(db.flow.map(f => f.is_active), [false, true]);
});

test('password reset link is emailed and stored only as a hash', async () => {
  seed();
  const transport = nodemailer.createTransport({ jsonTransport: true });
  const mails = [];
  const originalSend = transport.sendMail.bind(transport);
  transport.sendMail = async message => { mails.push(message); return originalSend(message); };
  mailService.setTransportForTests(transport);
  process.env.SMTP_FROM = 'Adapter <no-reply@exemplo.com>';

  const unknown = await call(null, '/api/password-reset/request', 'POST', { username: 'ninguem' });
  const withoutEmail = await call(null, '/api/password-reset/request', 'POST', { username: 's1' });
  const byEmail = await call(null, '/api/password-reset/request', 'POST', { username: 'ADMIN@loja.com' });
  assert.deepEqual(unknown.body, byEmail.body);
  assert.deepEqual(withoutEmail.body, byEmail.body);

  for (let i = 0; i < 20 && !mails.length; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'admin@loja.com');
  const token = mails[0].text.match(/token=([a-f0-9]{64})/)[1];
  assert.ok(mails[0].text.includes('https://painel.exemplo.com/reset-password?token='));
  assert.equal(db.passwordResetToken[0].token, crypto.createHash('sha256').update(token).digest('hex'));
  assert.equal((await call(null, `/api/password-reset/validate/${token}`)).body.valid, true);
});

test('email updates respect roles and uniqueness', async () => {
  seed();
  assert.equal((await call('s1', '/api/users/s1/email', 'PATCH', { email: 'Vendedor@Loja.com' })).status, 200);
  assert.equal(db.user.find(u => u.id === 's1').email, 'vendedor@loja.com');
  assert.equal((await call('s1', '/api/users/a1/email', 'PATCH', { email: 'x@loja.com' })).status, 403);
  assert.equal((await call('m1', '/api/users/a1/email', 'PATCH', { email: 'x@loja.com' })).status, 403);
  assert.equal((await call('m1', '/api/users/s1/email', 'PATCH', { email: 'admin@loja.com' })).status, 400);
  assert.equal((await call('a1', '/api/users/m1/email', 'PATCH', { email: 'invalido' })).status, 400);
  assert.equal((await call('a1', '/api/users/m1/email', 'PATCH', { email: 'sup@loja.com' })).status, 200);

  const sellerView = await call('s1', '/api/users');
  assert.equal(sellerView.body.find(u => u.id === 'a1').email, undefined, 'vendedor nao ve e-mail dos outros');
});

test('phone and status updates respect roles and normalize numbers', async () => {
  seed();
  assert.equal((await call('s1', '/api/users/s1/phone', 'PATCH', { phone: '21 98508-0634' })).status, 200);
  assert.equal(db.user.find(u => u.id === 's1').phone, '5521985080634');
  assert.equal((await call('s1', '/api/users/a1/phone', 'PATCH', { phone: '21999999999' })).status, 403);
  assert.equal((await call('a1', '/api/users/s1/phone', 'PATCH', { phone: '123' })).status, 400);
  assert.equal((await call('a1', '/api/users/s1/status', 'PATCH', { status: 'online' })).status, 200);
  assert.equal(db.user.find(u => u.id === 's1').status, 'online');
  assert.equal((await call('s1', '/api/users/a1/status', 'PATCH', { status: 'offline' })).status, 403);
});

test('conversation shows the answers captured by the flow', async () => {
  seed();
  db.chat.push({ id: 'chat9', company_id: 'c1', assigned_to: 's1' });
  db.flowSession.push({ id: 's9', chat_id: 'chat9', company_id: 'c1', flow_name: 'Captação', status: 'finished', variables: { nome: 'Ana' } });
  const res = await call('s1', '/api/chats/chat9/flow');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.variables, { nome: 'Ana' });
});
