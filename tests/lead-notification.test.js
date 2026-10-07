const test = require('node:test');
const assert = require('node:assert/strict');
const qualification = { product: 'iPhone 13', variant: '128 GB', payment: 'Pix', context: 'quero comprar o iPhone 13' };
let sent;
let currentPhone = '5511999999999', currentJid;
require.cache[require.resolve('../src/config/database')] = { exports: { prisma: {
  user: { findFirst: async ({ where }) => where.id ? { id: 'seller', phone: '5511988888888' } : null },
  chat: { findUnique: async () => ({ company_id: 'c1', client_phone: currentPhone, remote_jid: currentJid, messages: [{ sender: 'system', is_note: true, text: 'Triagem do lead: ' + JSON.stringify(qualification) }] }) }
} } };
require.cache[require.resolve('../src/services/whatsappService')] = { exports: {
  getActiveConnections: () => ({ store: { connectionStatus: 'open', companyId: 'c1' } }),
  sendMessage: async (instance, jid, content) => { sent = { instance, jid, ...content }; }
} };
const { notifySeller } = require('../src/services/leadNotificationService');
test('seller notification includes confirmed device, variant, payment without exposing store conversation messages', async () => {
  await notifySeller({ id: 'chat1', company_id: 'c1', instance_id: 'store', client_name: 'Daniel' }, 'seller');
  assert.equal(sent.instance, 'store');
  assert.equal(sent.jid, '5511988888888@s.whatsapp.net');
  assert.match(sent.text, /Produto: iPhone 13/);
  assert.match(sent.text, /Variacao: 128 GB/);
  assert.match(sent.text, /Pagamento: Pix/);
  assert.doesNotMatch(sent.text, /quero comprar o iPhone 13/);
});
test('unresolved LID never becomes a phone or wa.me link in a seller notification', async () => {
  currentPhone = '66791506194465'; currentJid = '66791506194465@lid';
  await notifySeller({ id: 'chat1', company_id: 'c1', instance_id: 'store' }, 'seller');
  assert.doesNotMatch(sent.text, /wa\.me|66791506194465/); assert.match(sent.text, /aguardando identificação/);
});
test('resolved customer phone is sent even when the chat retains its LID alias', async () => {
  currentPhone = '5521985080634'; currentJid = '66791506194465@lid';
  await notifySeller({ id: 'chat1', company_id: 'c1', instance_id: 'store' }, 'seller');
  assert.match(sent.text, /wa\.me\/5521985080634/); assert.doesNotMatch(sent.text, /66791506194465/);
});
