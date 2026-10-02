const test = require('node:test');
const assert = require('node:assert/strict');
const { kanbanLeads } = require('../frontend/src/utils/kanbanLeads.ts');
const store = { id: 'store-chat', company_id: 'c1', client_phone: '5521985080634', assigned_to: 's1', status: 'interesse em compra', instance: { user_id: null } };
const personal = { ...store, id: 'seller-chat', instance: { user_id: 's1' } };
test('legacy captured store and seller chats are separated into forwarded and attendance', () => {
  const cards = kanbanLeads([store, personal]);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].status, 'encaminhados');
  assert.equal(cards[1].status, 'em atendimento');
  assert.equal(store.status, 'interesse em compra');
});
test('waiting interest with an active deadline stays in interest', () => {
  assert.equal(kanbanLeads([{ ...store, sales_reply_due_at: '2026-10-02T12:00:00Z' }])[0].status, 'interesse em compra');
});
test('explicit new stages and finalized conversations are preserved', () => {
  for (const status of ['encaminhados', 'em atendimento', 'finalizada']) assert.equal(kanbanLeads([{ ...store, status }])[0].status, status);
});
