const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Defina TEST_DATABASE_URL para um PostgreSQL isolado. Este teste nao usa DATABASE_URL de producao.');
const parsed = new URL(url);
if (!parsed.pathname.includes('test')) throw new Error('O nome do banco integrado deve conter test.');
process.env.DATABASE_URL = url;
process.env.JWT_SECRET ||= 'integration-only-secret-with-more-than-32-characters';
process.env.ENCRYPTION_KEY ||= 'integration-only-key-with-more-than-32-characters';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasourceUrl: url });
const prefix = 'audit-' + randomUUID();
const c1 = prefix + '-c1', c2 = prefix + '-c2';
test.before(async () => {
  await prisma.company.createMany({ data: [{ id: c1, name: 'Audit 1', slug: c1 }, { id: c2, name: 'Audit 2', slug: c2 }] });
  await prisma.user.create({ data: { id: prefix + '-u2', company_id: c2, name: 'Audit', username: prefix, password: 'synthetic-test-hash', role: 'seller' } });
});
test.after(async () => { await prisma.company.deleteMany({ where: { id: { in: [c1, c2] } } }); await prisma.$disconnect(); await require('../../src/config/database').prisma.$disconnect(); });
test('database rejects an instance/user link across tenants', async () => {
  await assert.rejects(prisma.instance.create({ data: { id: prefix + '-i1', name: 'Audit', company_id: c1, user_id: prefix + '-u2' } }), error => error.code === 'P2003');
});
test('transaction failure rolls back its first mutation', async () => {
  await assert.rejects(prisma.$transaction(async tx => { await tx.company.update({ where: { id: c1 }, data: { name: 'Must rollback' } }); throw new Error('forced'); }));
  assert.equal((await prisma.company.findUnique({ where: { id: c1 } })).name, 'Audit 1');
});
test('conditional schedule claim allows only one concurrent worker', async () => {
  const id = prefix + '-schedule';
  await prisma.scheduledMessage.create({ data: { id, company_id: c1, chat_id: 'synthetic', client_name: 'Audit', text: 'Audit', scheduledTime: new Date(), created_by: 'Audit' } });
  const claims = await Promise.all([1, 2].map(() => prisma.scheduledMessage.updateMany({ where: { id, status: 'pending' }, data: { status: 'processing' } })));
  assert.equal(claims.reduce((sum, claim) => sum + claim.count, 0), 1);
});

test('company lock enforces the user limit under concurrent creates', async () => {
  await prisma.company.update({ where: { id: c2 }, data: { max_users: 2 } });
  const User = require('../../src/models/User');
  const results = await Promise.allSettled([1, 2].map(index => User.create({ id: prefix + '-concurrent-' + index, name: 'Audit', username: prefix + '-concurrent-' + index, password: 'synthetic-test-hash', role: 'seller' }, c2)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await prisma.user.count({ where: { company_id: c2 } }), 2);
});
test('SQL statistics exclude other tenants and internal notes', async () => {
  const owner = prefix + '-u1', instance = prefix + '-statistics-instance', chat = prefix + '-statistics-chat';
  await prisma.user.create({ data: { id: owner, name: 'Audit', username: owner, password: 'synthetic-test-hash', role: 'seller', company_id: c1 } });
  await prisma.instance.create({ data: { id: instance, name: 'Audit', company_id: c1, user_id: owner } });
  await prisma.chat.create({ data: { id: chat, instance_id: instance, company_id: c1, client_name: 'Audit', client_phone: 'synthetic', tags: [], assigned_to: owner, sector: 'sales' } });
  await prisma.message.createMany({ data: [{ chat_id: chat, sender: 'attendant', sender_id: owner, text: 'Audit' }, { chat_id: chat, sender: 'attendant', sender_id: owner, text: 'Internal', is_note: true }] });
  await prisma.metric.createMany({ data: [{ chat_id: chat, company_id: c1, type: 'response_time', attendant_id: owner, duration_seconds: 30 }, { chat_id: 'synthetic', company_id: c2, type: 'response_time', duration_seconds: 999 }] });
  const result = await require('../../src/services/metricsService').getStatistics(c1);
  assert.equal(result.kpis.totalChats, 1);
  assert.equal(result.kpis.tmrHumano, 30);
  assert.equal(result.attendants.find(user => user.id === owner).repliesCount, 1);
  assert.equal(result.history.reduce((sum, row) => sum + row.attendantMessages, 0), 1);
});
