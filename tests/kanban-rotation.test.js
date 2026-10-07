const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
process.env.JWT_SECRET = 'kanban-test-secret-'.repeat(3);
process.env.ENCRYPTION_KEY = 'kanban-test-key-'.repeat(3);
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

const now = new Date('2026-09-28T12:00:00Z');
let db, queue = Promise.resolve();
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(part => matches(row, part));
    if (key === 'AND') return value.every(part => matches(row, part));
    if (key === 'chat') return matches(db.chats.find(chat => chat.id === row.chat_id), value);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if (value.in !== undefined) return value.in.includes(row?.[key]);
      if (value.not !== undefined) return (row?.[key] ?? null) !== value.not;
      if (value.lte !== undefined) return row[key] && new Date(row[key]) <= value.lte;
      return matches(row[key], value);
    }
    return (row?.[key] ?? null) === value;
  });
}
const copy = value => value ? structuredClone(value) : value;
const prisma = {
  followUpTask: { updateMany: async () => ({ count: 0 }) },
  opportunity: {
    findUnique: async ({ where }) => copy((db.opportunities || []).find(row => matches(row, where.company_id_phone))),
    create: async ({ data }) => { const row = { id: 'lead-' + (db.opportunities || []).length, ...data }; (db.opportunities ||= []).push(row); return copy(row); },
    update: async ({ where, data }) => Object.assign(db.opportunities.find(row => matches(row, where)), data)
  },
  $transaction: work => {
    const result = queue.then(() => work(prisma));
    queue = result.catch(() => {});
    return result;
  },
  $queryRaw: async (sql, companyId) => {
    assert.match(sql.join('?'), /FOR UPDATE/);
    return db.companies.filter(company => company.id === companyId).map(({ id }) => ({ id }));
  },
  company: {
    findUnique: async ({ where }) => copy(db.companies.find(row => matches(row, where))),
    update: async ({ where, data }) => Object.assign(db.companies.find(row => matches(row, where)), data)
  },
  user: {
    findMany: async ({ where }) => copy(db.users.filter(row => matches(row, where))),
    findFirst: async ({ where }) => copy(db.users.find(row => matches(row, where)))
  },
  instance: {
    findMany: async ({ where }) => copy(db.instances.filter(row => matches(row, where))),
    findFirst: async ({ where }) => copy(db.instances.find(row => matches(row, where)))
  },
  chat: {
    updateMany: async ({ where, data }) => { const rows = db.chats.filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; },
    findUnique: async ({ where }) => copy(db.chats.find(row => matches(row, where))),
    findFirst: async ({ where, include }) => {
      const row = copy(db.chats.find(row => matches(row, where)));
      if (row && include?.messages) row.messages = copy(db.messages.filter(message => message.chat_id === row.id));
      return row;
    },
    findMany: async ({ where, include }) => copy(db.chats.filter(row => matches(row, where)).map(row => ({ ...row, ...(include?.instance ? { instance: db.instances.find(instance => instance.id === row.instance_id) || null } : {}) }))),
    update: async ({ where, data }) => {
      const row = db.chats.find(row => matches(row, where));
      Object.assign(row, data);
      return { ...copy(row), messages: copy(db.messages.filter(message => message.chat_id === row.id)) };
    }
  },
  message: { create: async ({ data }) => { const result = { id: String(db.messages.length + 1), ...copy(data) }; db.messages.push(result); return result; } },
  auditLog: { create: async ({ data }) => { db.audit.push(copy(data)); return data; } },
  metric: { create: async ({ data }) => { db.metrics.push(copy(data)); return data; } },
  kanbanColumn: {
    count: async ({ where }) => db.columns.filter(row => matches(row, where)).length,
    findMany: async ({ where }) => copy(db.columns.filter(row => matches(row, where))),
    findFirst: async ({ where }) => copy(db.columns.find(row => matches(row, where))),
    create: async ({ data }) => {
      if (db.columns.some(row => row.name === data.name && row.user_id === data.user_id)) throw Object.assign(new Error(), { code: 'P2002' });
      const row = { id: 'col-' + (db.columns.length + 1), ...data }; db.columns.push(row); return copy(row);
    },
    updateMany: async ({ where, data }) => { const rows = db.columns.filter(row => matches(row, where)); rows.forEach(row => Object.assign(row, data)); return { count: rows.length }; },
    deleteMany: async ({ where }) => {
      const removed = db.columns.filter(row => matches(row, where));
      db.columns = db.columns.filter(row => !matches(row, where));
      db.cards = db.cards.filter(row => !removed.some(column => column.id === row.column_id));
      return { count: removed.length };
    }
  },
  kanbanCard: {
    findMany: async ({ where }) => copy(db.cards.filter(row => matches(row, where))),
    deleteMany: async ({ where }) => { db.cards = db.cards.filter(row => !matches(row, where)); return {}; },
    upsert: async ({ where, create, update }) => {
      const row = db.cards.find(row => matches(row, where.user_id_chat_id));
      if (row) return Object.assign(row, update);
      db.cards.push(copy(create)); return create;
    }
  }
};
require.cache[require.resolve('../src/config/database')] = { exports: { prisma } };
const rotation = require('../src/services/salesRotationService');
const { generateToken } = require('../src/config/auth');
const router = require('../src/routes/kanbanRoutes');
let server, base;
test.before(async () => {
  const app = express(); app.use(express.json()); app.use('/kanban', router);
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/kanban`;
});
test.after(() => new Promise(resolve => server.close(resolve)));
test.beforeEach(() => {
  db = {
    companies: [{ id: 'c1', is_active: true, sales_rotation_cursor: null }, { id: 'c2', is_active: true }],
    users: [
      { id: 's1', name: 'One', role: 'seller', status: 'online', company_id: 'c1' },
      { id: 's2', name: 'Two', role: 'seller', status: 'online', company_id: 'c1' },
      { id: 's3', name: 'Offline', role: 'seller', status: 'offline', company_id: 'c1' },
      { id: 'a1', name: 'Admin', role: 'admin', status: 'online', company_id: 'c1' },
      { id: 'a2', name: 'Supervisor', role: 'supervisor', status: 'online', company_id: 'c1' },
      { id: 'x1', name: 'Other company', role: 'seller', status: 'online', company_id: 'c2' }
    ],
    instances: [{ id: 'seller-chip', company_id: 'c1', user_id: 's1' }, { id: 'store', company_id: 'c1', user_id: null }],
    chats: [{ instance_id: 'seller-chip', id: 'chat1', company_id: 'c1', client_phone: '5521985080634', status: 'iniciada', assigned_to: 's1', claimed_at: null, sales_reply_due_at: null, is_archived: false, is_blocked: false }],
    columns: [], cards: [], messages: [], audit: [], metrics: []
  };
});
async function request(userId, suffix = '', method = 'GET', body) {
  const user = db.users.find(user => user.id === userId);
  const response = await fetch(base + suffix, { method, headers: { Authorization: 'Bearer ' + generateToken(user), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
}
const enter = () => rotation.updateChat('chat1', { status: rotation.INTEREST }, 'c1', null, now);
const after = ms => new Date(now.getTime() + ms);
const reply = overrides => rotation.recordMessage('chat1', { chat_id: 'chat1', text: 'Hello', sender: 'attendant', sender_id: 's1', is_ai: false, is_note: false, timestamp: after(1000), ...overrides }, after(1000));

test('fixed columns cannot be renamed or deleted by any profile', async () => {
  for (const user of ['s1', 'a1', 'a2']) for (const column of router.FIXED_COLUMNS) {
    assert.equal((await request(user, '/columns/' + encodeURIComponent(column.id), 'DELETE')).status, 403);
    assert.equal((await request(user, '/columns/' + encodeURIComponent(column.id), 'PATCH', { name: 'Changed' })).status, 403);
  }
});
test('personal columns are isolated by owner, including against admins and other tenants', async () => {
  const column = await request('s1', '/columns', 'POST', { name: 'Visit scheduled', user_id: 's2', company_id: 'c2' });
  assert.equal(column.status, 201);
  assert.equal((await request('s1')).body.columns.length, 6);
  for (const other of ['s2', 'a1', 'x1']) {
    assert.equal((await request(other)).body.columns.length, 5);
    assert.equal((await request(other, '/columns/' + column.body.id, 'DELETE')).status, 404);
    assert.equal((await request(other, '/columns/' + column.body.id, 'PATCH', { name: 'Changed' })).status, 404);
  }
});
test('reject reserved names and blank names', async () => {
  for (const name of ['', ' ', 'Iniciada / Novo', 'interesse em compra', 'Finalizada / Pago']) assert.equal((await request('s1', '/columns', 'POST', { name })).status, 400);
});
test('personal moves keep global stage and deadline; deleting a column keeps the chat', async () => {
  await enter();
  const due = db.chats[0].sales_reply_due_at.getTime();
  const column = (await request('s1', '/columns', 'POST', { name: 'Negotiation' })).body;
  assert.equal((await request('s1', '/cards/chat1', 'PUT', { column_id: column.id })).status, 200);
  assert.equal(db.chats[0].status, rotation.INTEREST);
  assert.equal(db.chats[0].sales_reply_due_at.getTime(), due);
  assert.equal((await request('s1')).body.placements.length, 1);
  assert.equal((await request('s2')).body.placements.length, 0);
  assert.equal((await request('s1', '/columns/' + column.id, 'DELETE')).status, 200);
  assert.equal(db.cards.length, 0); assert.equal(db.chats.length, 1);
});
test('unauthorized card moves cannot change another seller conversation', async () => {
  const column = (await request('s2', '/columns', 'POST', { name: 'Mine' })).body;
  assert.equal((await request('s2', '/cards/chat1', 'PUT', { column_id: column.id })).status, 404);
  assert.equal((await request('s2', '/cards/chat1', 'PUT', { column_id: 'finalizada' })).status, 403);
  assert.equal((await request('x1', '/cards/chat1', 'PUT', { column_id: 'finalizada' })).status, 404);
  assert.equal(db.chats[0].status, 'iniciada');
});
test('initial assignment rotates fairly across online sellers in the same company', async () => {
  const first = await enter(); assert.equal(first.assigned_to, 's1');
  assert.equal(first.sales_reply_due_at.getTime(), after(60000).getTime());
  db.chats.push({ ...db.chats[0], id: 'chat2', status: 'iniciada', assigned_to: null, sales_reply_due_at: null });
  const second = await rotation.updateChat('chat2', { status: rotation.INTEREST }, 'c1', null, now);
  assert.equal(second.assigned_to, 's2');
});
test('do not rotate before one minute; concurrent workers transfer only once', async () => {
  await enter();
  assert.equal(await rotation.rotateExpiredChat('chat1', 'c1', after(59999)), null);
  const results = await Promise.all([rotation.rotateExpiredChat('chat1', 'c1', after(60000)), rotation.rotateExpiredChat('chat1', 'c1', after(60000))]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(db.chats[0].assigned_to, 's2');
  assert.equal(db.chats[0].sales_reply_due_at.getTime(), after(120000).getTime());
  assert.equal(db.audit.filter(event => event.action === 'sales_rotation_timeout').length, 1);
});
test('AI, notes, scheduled messages and supervisor responses do not stop the timer', async () => {
  await enter();
  for (const change of [{ is_ai: true }, { is_note: true }, { is_scheduled: true }, { sender_id: 'a1' }]) await reply(change);
  assert.equal(db.chats[0].sales_reply_due_at.getTime(), after(60000).getTime());
});
test('a successfully recorded assigned seller response stops rotation', async () => {
  await enter(); await reply({});
  assert.equal(db.chats[0].sales_reply_due_at, null);
  assert.equal(await rotation.rotateExpiredChat('chat1', 'c1', after(60000)), null);
});
test('customer messages do not postpone a pending deadline or restart routing after seller reply', async () => {
  await enter();
  await reply({ sender: 'client', sender_id: null });
  assert.equal(db.chats[0].sales_reply_due_at.getTime(), after(60000).getTime());
  await reply({});
  await rotation.recordMessage('chat1', { chat_id: 'chat1', sender: 'client', timestamp: after(80000), text: 'Another question' }, after(80000));
  assert.equal(db.chats[0].sales_reply_due_at, null);
});
test('late replies by a previous owner cannot stop the new seller deadline', async () => {
  await enter(); await rotation.rotateExpiredChat('chat1', 'c1', after(60000));
  await reply({ timestamp: after(65000) });
  assert.equal(db.chats[0].assigned_to, 's2');
  assert.equal(db.chats[0].sales_reply_due_at.getTime(), after(120000).getTime());
});
test('offline sellers and other companies are never used as a fallback', async () => {
  await enter(); db.users.find(user => user.id === 's2').status = 'offline';
  await rotation.rotateExpiredChat('chat1', 'c1', after(60000));
  assert.equal(db.chats[0].assigned_to, 's1');
  assert.equal(db.audit.length, 1);
});
test('no online seller leaves lead waiting; a later eligible seller receives it', async () => {
  db.users.filter(user => user.company_id === 'c1' && user.role === 'seller').forEach(user => user.status = 'offline');
  await enter(); assert.equal(db.chats[0].assigned_to, null);
  db.users.find(user => user.id === 's2').status = 'online';
  await rotation.rotateExpiredChat('chat1', 'c1', after(60000));
  assert.equal(db.chats[0].assigned_to, 's2');
});
test('leaving Interest, archiving and blocking cancel the timeout', async () => {
  for (const change of [{ status: 'finalizada' }, { is_archived: true }, { is_blocked: true }]) {
    Object.assign(db.chats[0], { status: 'iniciada', is_archived: false, is_blocked: false });
    await enter(); await rotation.updateChat('chat1', change, 'c1', null, after(1000));
    assert.equal(db.chats[0].sales_reply_due_at, null);
    assert.equal(await rotation.rotateExpiredChat('chat1', 'c1', after(60000)), null);
  }
});

test('finalizing from Kanban preserves attendance metrics without duplication', async () => {
  await enter();
  const first = await request('s1', '/cards/chat1', 'PUT', { column_id: 'finalizada' });
  assert.equal(first.status, 200);
  assert.equal(db.metrics.length, 1);
  assert.equal(db.metrics[0].attendant_id, 's1');
  assert.equal(db.chats[0].claimed_at, null);
  await request('s1', '/cards/chat1', 'PUT', { column_id: 'finalizada' });
  assert.equal(db.metrics.length, 1);
});

test('an asynchronous AI status cannot cancel rotation or reopen a completed sale', async () => {
  await enter();
  const deadline = copy(db.chats[0].sales_reply_due_at);
  await rotation.updateChat('chat1', { status: 'iniciada' }, 'c1', null, after(1000), { source: 'ai' });
  assert.equal(db.chats[0].status, rotation.INTEREST);
  assert.deepEqual(db.chats[0].sales_reply_due_at, deadline);
  await rotation.updateChat('chat1', { status: 'finalizada' }, 'c1', null, after(2000));
  await rotation.updateChat('chat1', { status: rotation.INTEREST }, 'c1', null, after(3000), { source: 'ai' });
  assert.equal(db.chats[0].status, 'finalizada');
  assert.equal(db.chats[0].sales_reply_due_at, null);
});

test('human handoff keeps AI active and assigns a seller even when AI status stayed initiated', async () => {
  Object.assign(db.chats[0], { ai_active: true, assigned_to: null, instance_id: 'store' });
  const result = await rotation.handoffToHuman('chat1', 'c1', now);
  assert.equal(result.status, rotation.INTEREST);
  assert.equal(result.ai_active, true);
  assert.equal(result.assigned_to, 's1');
  assert.equal(result.instance_id, 'store');
  assert.equal(result.sector, 'sales');
  assert.deepEqual(result.sales_reply_due_at, after(60000));
  assert.equal(db.messages.length, 2);
  const repeated = await rotation.handoffToHuman('chat1', 'c1', after(1000));
  assert.equal(repeated.assigned_to, 's1');
  assert.deepEqual(repeated.sales_reply_due_at, after(60000));
  assert.equal(db.messages.length, 2);
});
test('human handoff routes an interest lead that still has no owner', async () => {
  Object.assign(db.chats[0], { ai_active: true, assigned_to: null, status: rotation.INTEREST });
  const result = await rotation.handoffToHuman('chat1', 'c1', now);
  assert.equal(result.assigned_to, 's1');
  assert.deepEqual(result.sales_reply_due_at, after(60000));
});
test('human handoff waits without online sellers and worker assigns when one returns', async () => {
  Object.assign(db.chats[0], { ai_active: true, assigned_to: null });
  db.users.filter(user => user.company_id === 'c1').forEach(user => { user.status = 'offline'; });
  const result = await rotation.handoffToHuman('chat1', 'c1', now);
  assert.equal(result.assigned_to, null);
  assert.equal(result.ai_active, true);
  assert.match(db.messages[0].text, /aguardando/);
  db.users.find(user => user.id === 's2').status = 'online';
  assert.equal((await rotation.rotateExpiredChat('chat1', 'c1', after(60000))).assigned_to, 's2');
});
test('human handoff does not reopen closed, blocked or manually paused chats', async () => {
  for (const overrides of [{ ai_active: false }, { ai_active: true, status: 'finalizada' }, { ai_active: true, is_blocked: true }, { ai_active: true, is_archived: true }]) {
    Object.assign(db.chats[0], { status: 'iniciada', ai_active: true, is_blocked: false, is_archived: false }, overrides);
    assert.equal(await rotation.handoffToHuman('chat1', 'c1', now), null);
  }
  assert.equal(db.messages.length, 0);
});

test('repeat handoff after seller reply preserves ownership and does not restart rotation', async () => {
  Object.assign(db.chats[0], { ai_active: true, status: rotation.INTEREST, assigned_to: 's1', sales_reply_due_at: null });
  const cursor = db.companies[0].sales_rotation_cursor;
  const result = await rotation.handoffToHuman('chat1', 'c1', now);
  assert.equal(result.ai_active, true);
  assert.equal(result.assigned_to, 's1');
  assert.equal(result.sales_reply_due_at, null);
  assert.equal(db.companies[0].sales_rotation_cursor, cursor);
  assert.equal(db.messages.length, 0);
  assert.equal(db.audit.length, 0);
});

test('reply from seller chip pauses the original store lead without changing its AI or connection', async () => {
  await enter();
  Object.assign(db.chats[0], { ai_active: true, instance_id: 'store' });
  db.chats.push({ ...copy(db.chats[0]), id: 'seller-chat', instance_id: 'seller-chip', ai_active: false, sales_reply_due_at: null });
  await rotation.recordMessage('seller-chat', { chat_id: 'seller-chat', sender: 'attendant', sender_id: 's1', text: 'Bom dia', timestamp: after(1000), is_ai: false }, after(1000));
  assert.equal(db.chats[0].sales_reply_due_at, null);
  assert.equal(db.chats[0].ai_active, true);
  assert.equal(db.chats[0].instance_id, 'store');
  assert.equal(db.chats[0].status, 'encaminhados');
  assert.equal(db.chats.find(chat => chat.id === 'seller-chat').status, 'em atendimento');
  assert.equal(await rotation.rotateExpiredChat('chat1', 'c1', after(60000)), null);
});

test('plain confirmation captures a single client across both connections and is idempotent', async () => {
  await enter();
  db.chats.push({ ...copy(db.chats[0]), id: 'seller-chat', instance_id: 'seller-chip' });
  const result = await rotation.confirmAttendance('c1', 's1', null, after(1000));
  assert.equal(result.status, 'confirmed');
  assert.equal(result.chats.length, 2);
  assert.ok(db.chats.every(chat => chat.sales_reply_due_at === null));
  assert.equal((await rotation.confirmAttendance('c1', 's1', 'chat1', after(2000))).status, 'confirmed');
  assert.equal(await rotation.rotateExpiredChat('chat1', 'c1', after(60000)), null);
});

test('plain confirmation with distinct clients requires an explicit selection', async () => {
  await enter();
  db.chats.push({ ...copy(db.chats[0]), id: 'another-client', client_phone: '5511988888888' });
  const result = await rotation.confirmAttendance('c1', 's1', null, after(1000));
  assert.equal(result.status, 'ambiguous');
  assert.ok(db.chats.every(chat => chat.sales_reply_due_at !== null));
});

test('a previous seller cannot confirm or stop rotation after ownership changes', async () => {
  await enter();
  await rotation.updateChat('chat1', { assigned_to: 's2' }, 'c1', null, after(1000));
  assert.equal((await rotation.confirmAttendance('c1', 's1', 'chat1', after(2000))).status, 'unavailable');
  db.chats.push({ ...copy(db.chats[0]), id: 'old-seller-chat', assigned_to: 's1', sales_reply_due_at: null });
  await rotation.recordMessage('old-seller-chat', { chat_id: 'old-seller-chat', sender: 'attendant', sender_id: 's1', text: 'Oi', timestamp: after(3000) }, after(3000));
  assert.deepEqual(db.chats[0].sales_reply_due_at, after(61000));
});

test('AI replies, internal notes and old messages on another connection do not capture the lead', async () => {
  await enter();
  db.chats.push({ ...copy(db.chats[0]), id: 'seller-chat', sales_reply_due_at: null });
  for (const extra of [{ is_ai: true }, { is_note: true }, { timestamp: new Date(now.getTime() - 1000) }]) {
    await rotation.recordMessage('seller-chat', { chat_id: 'seller-chat', sender: 'attendant', sender_id: 's1', text: 'Oi', timestamp: after(1000), ...extra }, after(1000));
  }
  assert.deepEqual(db.chats[0].sales_reply_due_at, after(60000));
});

test('worker repairs a legacy store deadline when a seller reply was recorded on another connection', async () => {
  await enter();
  db.chats.push({ ...copy(db.chats[0]), id: 'seller-chat', sales_reply_due_at: null });
  prisma.message.findFirst = async ({ where }) => {
    assert.equal(where.sender_id, 's1');
    assert.equal(where.chat.company_id, 'c1');
    assert.deepEqual(where.timestamp.gte, now);
    return { chat_id: 'seller-chat', sender_id: 's1', timestamp: after(1000) };
  };
  try {
    const result = await rotation.rotateExpiredChat('chat1', 'c1', after(60000));
    assert.equal(result.sales_reply_due_at, null);
    assert.equal(result.assigned_to, 's1');
    assert.equal(db.audit.filter(row => row.action === 'sales_rotation_timeout').length, 0);
  } finally { delete prisma.message.findFirst; }
});

test('new fixed stages exist and sellers cannot move a store card even when assigned', async () => {
  assert.ok(router.FIXED_COLUMNS.some(column => column.id === 'encaminhados'));
  assert.ok(router.FIXED_COLUMNS.some(column => column.id === 'em atendimento'));
  Object.assign(db.chats[0], { instance_id: 'store', assigned_to: 's1' });
  assert.equal((await request('s1', '/cards/chat1', 'PUT', { column_id: 'em atendimento' })).status, 403);
});

test('manual fixed-stage moves respect the originating connection and cancel the timeout', async () => {
  await enter();
  assert.equal((await request('a1', '/cards/chat1', 'PUT', { column_id: 'encaminhados' })).status, 400);
  assert.equal((await request('a1', '/cards/chat1', 'PUT', { column_id: 'em atendimento' })).status, 200);
  assert.equal(db.chats[0].sales_reply_due_at, null);
  Object.assign(db.chats[0], { instance_id: 'store', status: 'interesse em compra', sales_reply_due_at: after(60000) });
  assert.equal((await request('a1', '/cards/chat1', 'PUT', { column_id: 'em atendimento' })).status, 400);
  assert.equal((await request('a1', '/cards/chat1', 'PUT', { column_id: 'encaminhados' })).status, 200);
  assert.equal(db.chats[0].sales_reply_due_at, null);
});

test('repeat handoff keeps forwarded store chats out of the rotation and preserves AI', async () => {
  Object.assign(db.chats[0], { instance_id: 'store', status: 'encaminhados', assigned_to: 's1', ai_active: true, sales_reply_due_at: null });
  const result = await rotation.handoffToHuman('chat1', 'c1', now);
  assert.equal(result.status, 'encaminhados');
  assert.equal(result.ai_active, true);
  assert.equal(result.sales_reply_due_at, null);
  assert.equal(db.audit.length, 0);
});


test('an unresolved LID can confirm the assigned lead by ID without merging unrelated chats', async () => {
  db.chats[0].remote_jid = '202147551526944@lid';
  db.chats[0].client_phone = '202147551526944';
  await enter();
  db.chats.push({ ...copy(db.chats[0]), id: 'other-lid', remote_jid: '14844145209409@lid', client_phone: '14844145209409' });
  const result = await rotation.confirmAttendance('c1', 's1', 'chat1', after(1000));
  assert.equal(result.status, 'confirmed');
  assert.equal(db.chats[0].sales_reply_due_at, null);
  assert.notEqual(db.chats[1].sales_reply_due_at, null);
  assert.equal(await rotation.rotateExpiredChat('chat1', 'c1', after(60000)), null);
});

test('confirmation cannot report success when a newer claim prevents actual capture', async () => {
  await enter();
  db.chats[0].claimed_at = after(5000);
  const result = await rotation.confirmAttendance('c1', 's1', 'chat1', after(1000));
  assert.equal(result.status, 'unavailable');
  assert.notEqual(db.chats[0].sales_reply_due_at, null);
});
