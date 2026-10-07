const test = require('node:test');
const assert = require('node:assert/strict');
let rows = [], queue = Promise.resolve();
const matches = (row, where) => Object.entries(where).every(([key, value]) => {
  if (key === 'OR') return value.some(part => matches(row, part));
  return value && typeof value === 'object' ? value.in.includes(row[key]) : row[key] === value;
});
const db = { chat: {
  findFirst: async ({ where }) => rows.find(row => matches(row, where)) || null,
  create: async ({ data }) => { const row = { ...data, messages: [] }; rows.push(row); return row; },
  update: async ({ where, data }) => Object.assign(rows.find(row => row.id === where.id), data)
} };
require.cache[require.resolve('../src/config/database')] = { exports: { prisma: db } };
require.cache[require.resolve('../src/services/salesRotationService')] = { exports: {
  withCompanyLock: (_company, work) => { const pending = queue.then(() => work(db)); queue = pending.catch(() => {}); return pending; }
} };
const { findOrCreate, identity, phoneForChat } = require('../src/services/chatIdentityService');
const PN = '5511999999999@s.whatsapp.net';
const LID = '123456789012345@lid';
const resolve = (jid, alt, company = 'c1', instance = 'store') => findOrCreate(company, instance, jid, alt, { client_name: 'Daniel' });
test.beforeEach(() => { rows = []; queue = Promise.resolve(); });
test('PN then LID then PN reuse a single conversation and preserve origin', async () => {
  const first = await resolve(PN);
  const alternative = await resolve(LID, PN);
  const last = await resolve(PN);
  assert.equal(rows.length, 1);
  assert.equal(alternative.chat.id, first.chat.id);
  assert.equal(last.chat.id, first.chat.id);
  assert.equal(alternative.created, false);
  assert.equal(first.chat.instance_id, 'store');
  assert.equal(first.chat.client_phone, '5511999999999');
});
test('LID with no known number later learns PN without creating another record', async () => {
  const first = await resolve(LID);
  const identified = await resolve(PN, LID);
  assert.equal(identified.chat.id, first.chat.id);
  assert.equal(rows.length, 1);
  assert.equal(identified.chat.client_phone, '5511999999999');
});
test('concurrent identity events do not race to create multiple conversations', async () => {
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) => resolve(index % 2 ? LID : PN, index % 2 ? PN : LID)));
  assert.equal(rows.length, 1);
  assert.equal(results.filter(result => result.created).length, 1);
});
test('same phone across companies or connections remains isolated', async () => {
  await resolve(PN);
  await resolve(PN, null, 'c2');
  await resolve(PN, null, 'c1', 'seller');
  assert.equal(rows.length, 3);
});
test('LID is not treated as a real telephone number', () => {
  assert.equal(identity(LID).phone, null);
  assert.equal(identity(LID, PN).phone, '5511999999999');
});
test('lead phone uses a phone JID or a resolved phone, never the LID identifier', () => {
  assert.equal(phoneForChat({ remote_jid: '66791506194465@lid', client_phone: '66791506194465' }), null);
  assert.equal(phoneForChat({ remote_jid: '1234567890123@lid', client_phone: '1234567890123' }), null);
  assert.equal(phoneForChat({ remote_jid: '66791506194465@lid', client_phone: '5521985080634' }), '5521985080634');
  assert.equal(phoneForChat({ remote_jid: '5521985080634:3@s.whatsapp.net', client_phone: '66791506194465' }), '5521985080634');
});
