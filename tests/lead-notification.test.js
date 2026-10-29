const test = require('node:test');
const assert = require('node:assert/strict');
const qualification = { product: 'iPhone 13', variant: '128 GB', payment: 'Pix', context: 'quero comprar o iPhone 13' };
let sent;
let currentPhone = '5511999999999', currentJid;
let accepted = [];
require.cache[require.resolve('../src/config/database')] = { exports: { prisma: {
  user: {
    findFirst: async ({ where }) => where.id ? { id: 'seller', phone: '5511988888888' } : null,
    findMany: async () => [{ id: 'seller', name: 'Seller' }, { id: 'other', name: 'Other' }]
  },
  auditLog: { findMany: async () => accepted },
  chat: { findUnique: async () => ({ company_id: 'c1', client_phone: currentPhone, remote_jid: currentJid, messages: [{ sender: 'system', is_note: true, text: 'Triagem do lead: ' + JSON.stringify(qualification) }] }) }
} } };
require.cache[require.resolve('../src/services/whatsappService')] = { exports: {
  getActiveConnections: () => ({ store: { connectionStatus: 'open', companyId: 'c1' } }),
  sendMessage: async (instance, jid, content) => { sent = { instance, jid, ...content }; }
} };
require.cache[require.resolve('../src/services/pushService')] = { exports: { send: async () => true } };
const { notifySeller, notifyAccepted, sendLeadDetails } = require('../src/services/leadNotificationService');
const { standingText } = require('../src/services/leadRankingService');

test('new lead notice asks for ACEITAR and never reveals the client before acceptance', async () => {
  currentPhone = '5511999999999'; currentJid = undefined;
  accepted = [{ user_id: 'other' }];
  await notifySeller({ id: 'chat1', company_id: 'c1', instance_id: 'store', client_name: 'Daniel' }, 'seller');
  assert.equal(sent.jid, '5511988888888@s.whatsapp.net');
  assert.match(sent.text, /ACEITAR/);
  assert.match(sent.text, /2º lugar/);
  assert.doesNotMatch(sent.text, /Daniel|5511999999999|wa\.me|iPhone/);
});
test('accepted lead sends client, triage and the updated ranking', async () => {
  accepted = [{ user_id: 'seller' }, { user_id: 'seller' }, { user_id: 'other' }];
  await notifyAccepted({ id: 'chat1', company_id: 'c1', instance_id: 'store', client_name: 'Daniel' }, 'seller');
  assert.equal(sent.instance, 'store');
  assert.match(sent.text, /Lead aceito/);
  assert.match(sent.text, /Daniel/);
  assert.match(sent.text, /Produto: iPhone 13/);
  assert.match(sent.text, /Variacao: 128 GB/);
  assert.match(sent.text, /Pagamento: Pix/);
  assert.match(sent.text, /\+1 ponto/);
  assert.match(sent.text, /1º lugar .* 2 pontos\. Parabéns/);
  assert.doesNotMatch(sent.text, /quero comprar o iPhone 13/);
});
test('unresolved LID never becomes a phone or wa.me link in lead details', async () => {
  currentPhone = '66791506194465'; currentJid = '66791506194465@lid';
  await sendLeadDetails({ id: 'chat1', company_id: 'c1', instance_id: 'store' }, 'seller');
  assert.doesNotMatch(sent.text, /wa\.me|66791506194465/); assert.match(sent.text, /aguardando identificação/);
});
test('resolved customer phone is sent even when the chat retains its LID alias', async () => {
  currentPhone = '5521985080634'; currentJid = '66791506194465@lid';
  await sendLeadDetails({ id: 'chat1', company_id: 'c1', instance_id: 'store' }, 'seller');
  assert.match(sent.text, /wa\.me\/5521985080634/); assert.doesNotMatch(sent.text, /66791506194465/);
});
test('ranking shares positions on ties and shows the gap to the next place', () => {
  const list = [{ id: 'a', points: 5, position: 1 }, { id: 'b', points: 3, position: 2 }, { id: 'c', points: 3, position: 2 }, { id: 'd', points: 0, position: 4 }];
  assert.match(standingText(list, 'a'), /1º lugar .* 5 pontos/);
  assert.match(standingText(list, 'c'), /2º lugar .* 3 pontos\. Faltam 2 pontos/);
  assert.match(standingText(list, 'd'), /4º lugar .* 0 pontos\. Faltam 3 pontos/);
  assert.match(standingText([{ id: 'a', points: 0, position: 1 }], 'a'), /Ninguém pontuou/);
});
