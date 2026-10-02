const test = require('node:test');
const assert = require('node:assert/strict');
const { kanbanLeads } = require('../frontend/src/utils/kanbanLeads.ts');
const store = { id: 'store-chat', company_id: 'c1', client_phone: '5521985080634', remote_jid: '5521985080634@s.whatsapp.net', assigned_to: 's1', status: 'interesse em compra', instance: { user_id: null } };
const personal = { ...store, id: 'seller-chat', instance: { user_id: 's1' } };
test('store and seller conversations appear as one lead with the original chat as representative', () => {
  assert.deepEqual(kanbanLeads([personal, store]).map(chat => chat.id), ['store-chat']);
  assert.deepEqual(kanbanLeads([store, personal]).map(chat => chat.id), ['store-chat']);
});
test('board grouping preserves companies, owners and unidentified LIDs', () => {
  const differentCompany = { ...personal, id: 'other-company', company_id: 'c2' };
  const differentSeller = { ...personal, id: 'other-seller', assigned_to: 's2' };
  const unknownLid = { ...personal, id: 'unknown-lid', client_phone: '123456789012345', remote_jid: '123456789012345@lid' };
  assert.equal(kanbanLeads([store, personal, differentCompany, differentSeller, unknownLid]).length, 4);
});
test('national and country-prefixed Brazilian numbers represent the same lead', () => {
  assert.equal(kanbanLeads([store, { ...personal, client_phone: '21985080634' }]).length, 1);
});
