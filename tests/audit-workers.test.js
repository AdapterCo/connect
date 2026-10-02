const test = require('node:test');
const assert = require('node:assert/strict');
const { db, reset, install } = require('./helpers/memory-prisma');
install();
require.cache[require.resolve('../src/services/whatsappService')] = { exports: { getActiveConnections: () => ({}), sendMessage: async () => { throw new Error('Disconnected'); } } };
const { checkScheduledMessages } = require('../src/services/schedulerService');
const { anonymizeClientData, deleteClientData } = require('../src/services/privacyService');
const { checkExpiredSubscriptions } = require('../src/services/billingService');
test.beforeEach(reset);
test('failed scheduled send remains retryable and creates no delivered message', async () => {
  db.company.push({ id: 'c1', is_active: true });
  db.chat.push({ id: 'ch1', company_id: 'c1', instance_id: 'i1', client_phone: '5511999999999' });
  db.scheduledMessage.push({ id: 's1', company_id: 'c1', chat_id: 'ch1', status: 'pending', attempts: 0, text: 'Hello', scheduledTime: new Date(0), next_attempt_at: new Date(0) });
  await checkScheduledMessages();
  assert.equal(db.scheduledMessage[0].status, 'pending');
  assert.ok(db.scheduledMessage[0].next_attempt_at > new Date());
  assert.equal(db.message.length, 0);
});
test('anonymization clears JID, notes, flow variables, schedules and queues both media sources', async () => {
  db.chat.push({ id: 'ch1', company_id: 'c1', remote_jid: '5511999999999@s.whatsapp.net' });
  db.message.push({ id: 'm1', chat_id: 'ch1', sender_id: 'user', media_url: '/uploads/test.jpg', text: 'Personal data', is_note: true });
  db.scheduledMessage.push({ id: 's1', chat_id: 'ch1', company_id: 'c1', media_url: '/uploads/planned.pdf' });
  db.flowSession.push({ id: 'f1', chat_id: 'ch1', company_id: 'c1', variables: { name: 'Client' } });
  await anonymizeClientData({ companyId: 'c1', chatId: 'ch1' });
  assert.equal(db.chat[0].remote_jid, null);
  assert.equal(db.message[0].media_url, null);
  assert.equal(db.message[0].sender_id, null);
  assert.deepEqual(db.flowSession[0].variables, {});
  assert.equal(db.scheduledMessage.length, 0);
  assert.deepEqual(new Set(db.mediaDeletion.map(row => row.url)), new Set(['/uploads/test.jpg', '/uploads/planned.pdf']));
});
test('privacy deletion queues media before removing chat and unlinked schedules', async () => {
  db.chat.push({ id: 'ch1', company_id: 'c1' });
  db.scheduledMessage.push({ id: 's1', chat_id: 'ch1', company_id: 'c1', media_url: '/uploads/planned.pdf' });
  assert.equal(await deleteClientData({ companyId: 'c1', chatId: 'ch1' }), true);
  assert.equal(db.chat.length, 0);
  assert.equal(db.scheduledMessage.length, 0);
  assert.equal(db.mediaDeletion[0].url, '/uploads/planned.pdf');
});
test('an old cancelled subscription cannot suspend a company with renewed entitlement', async () => {
  db.company.push({ id: 'c1', is_active: true, expires_at: new Date(Date.now() + 86400000) });
  db.subscription.push({ id: 'old', company_id: 'c1', status: 'cancelled', current_period_end: new Date(0) });
  await checkExpiredSubscriptions();
  assert.equal(db.company[0].is_active, true);
  assert.equal(db.subscription[0].status, 'expired');
  await checkExpiredSubscriptions();
  assert.equal(db.company[0].is_active, true);
});
test('cancelled subscription loses access only after paid period ends', async () => {
  db.company.push({ id: 'c1', name: 'Test', is_active: true, expires_at: new Date(0) });
  db.subscription.push({ id: 'old', company_id: 'c1', status: 'cancelled', current_period_end: new Date(0), company: { name: 'Test' }, plan: { name: 'Test' } });
  await checkExpiredSubscriptions();
  assert.equal(db.company[0].is_active, false);
  assert.equal(db.subscription[0].status, 'expired');
});
