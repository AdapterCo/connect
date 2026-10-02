const test = require('node:test');
const assert = require('node:assert/strict');
const qualification = { product: 'iPhone 13', variant: '128 GB', payment: 'Pix', context: 'quero comprar o iPhone 13' };
let sent;
require.cache[require.resolve('../src/config/database')] = { exports: { prisma: {
  user: { findFirst: async ({ where }) => where.id ? { id: 'seller', phone: '5511988888888' } : null },
  chat: { findUnique: async () => ({ company_id: 'c1', client_phone: '5511999999999', messages: [{ sender: 'system', is_note: true, text: 'Triagem do lead: ' + JSON.stringify(qualification) }] }) }
} } };
require.cache[require.resolve('../src/services/whatsappService')] = { exports: {
  getActiveConnections: () => ({ store: { connectionStatus: 'open', companyId: 'c1' } }),
  sendMessage: async (instance, jid, content) => { sent = { instance, jid, ...content }; }
} };
const { notifySeller } = require('../src/services/leadNotificationService');
test('seller notification includes confirmed device, variant, payment and conversation context', async () => {
  await notifySeller({ id: 'chat1', company_id: 'c1', instance_id: 'store', client_name: 'Daniel' }, 'seller');
  assert.equal(sent.instance, 'store');
  assert.equal(sent.jid, '5511988888888@s.whatsapp.net');
  assert.match(sent.text, /Aparelho: iPhone 13/);
  assert.match(sent.text, /Variacao: 128 GB/);
  assert.match(sent.text, /Pagamento: Pix/);
  assert.match(sent.text, /quero comprar o iPhone 13/);
});
