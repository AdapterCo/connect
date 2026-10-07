const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePhone, confirmation } = require('../src/services/sellerIdentityService');
const retry = require('../src/services/whatsappRetryService');
const PN = '5521959343672@s.whatsapp.net', LID = '202147551526944@lid';
const state = sock => ({ phoneAliases: new Map(), sock });

test('staff identity is resolved through the WhatsApp verified PN to LID lookup', async () => {
  let calls = 0;
  const conn = state({ onWhatsApp: async (...numbers) => { calls++; assert.deepEqual(numbers, [PN]); return [{ jid: PN, lid: LID, exists: true }]; } });
  assert.equal(await resolvePhone(conn, LID, null, async () => null, [PN]), PN);
  assert.equal(await resolvePhone(conn, LID, null, async () => null, [PN]), PN);
  assert.equal(calls, 1);
});
test('unknown LID never becomes a staff phone and lookup is bounded', async () => {
  let calls = 0;
  const conn = state({ onWhatsApp: async () => { calls++; return [{ jid: PN, lid: 'other@lid', exists: true }]; } });
  assert.equal(await resolvePhone(conn, LID, null, async () => null, [PN]), null);
  assert.equal(await resolvePhone(conn, LID, null, async () => null, [PN]), null);
  assert.equal(calls, 1);
});
test('new Baileys identity repository and known company contact resolve missing alternatives', async () => {
  assert.equal(await resolvePhone(state({ signalRepository: { lidMapping: { getPNForLID: async () => PN } } }), LID, null, async () => null), PN);
  assert.equal(await resolvePhone(state({}), LID, null, async () => PN), PN);
});
test('unregistered WhatsApp results cannot associate a sender with staff', async () => {
  assert.equal(await resolvePhone(state({ onWhatsApp: async () => [{ jid: PN, lid: LID, exists: false }] }), LID, null, async () => null, [PN]), null);
});
test('plain, quoted, explicit and ephemeral confirmation commands stay recognizable', () => {
  assert.deepEqual(confirmation({ conversation: 'Confirmar' }), { chatId: null });
  assert.deepEqual(confirmation({ conversation: 'CONFIRMAR chat_abc' }), { chatId: 'chat_abc' });
  assert.deepEqual(confirmation({ extendedTextMessage: { text: 'confirmar', contextInfo: { quotedMessage: { conversation: 'Envie CONFIRMAR chat_abc' } } } }), { chatId: 'chat_abc' });
  assert.deepEqual(confirmation({ ephemeralMessage: { message: { conversation: 'Confirmar' } } }), { chatId: null });
  assert.equal(confirmation({ conversation: 'quero confirmar a compra' }), null);
});
test('retry cache includes notifications without a chat message, expires and stays instance isolated', () => {
  const conn = {}, other = {}, message = { conversation: 'Novo Lead' };
  retry.remember(conn, 'notification', message, 0);
  assert.equal(retry.get(conn, 'notification', 1000), message);
  assert.equal(retry.get(other, 'notification', 1000), undefined);
  assert.equal(retry.get(conn, 'notification', 86400000), undefined);
  for (let i = 0; i < 501; i++) retry.remember(conn, String(i), message, 0);
  assert.equal(conn.sentMessages.size, 500);
  assert.equal(retry.get(conn, '0', 1), undefined);
});


test('confirmation handler intercepts unknown LID without calling rotation or customer AI', async () => {
  let assigned = 0, ai = 0, reply;
  const { handleConfirmation } = require('../src/services/sellerIdentityService');
  const handled = await handleConfirmation({ command: confirmation({ conversation: 'CONFIRMAR chat_abc' }), teamMember: null,
    confirm: async () => { assigned++; }, send: async text => { reply = text; }, log: { warn() {}, info() {} } });
  if (!handled) ai++;
  assert.equal(assigned, 0); assert.equal(ai, 0); assert.match(reply, /cadastro de vendedor/);
});
test('verified seller confirmation and ambiguity never fall through to AI', async () => {
  const { handleConfirmation } = require('../src/services/sellerIdentityService');
  for (const status of ['confirmed', 'ambiguous', 'unavailable']) {
    let reply;
    assert.equal(await handleConfirmation({ command: { chatId: 'chat_abc' }, teamMember: { id: 'seller1' },
      confirm: async (seller, lead) => { assert.equal(seller, 'seller1'); assert.equal(lead, 'chat_abc'); return { status, chat: { client_name: 'Daniel' }, chats: [{ id: 'chat_abc', client_name: 'Daniel' }] }; },
      send: async text => { reply = text; }, log: { warn() {}, info() {} } }), true);
    assert.equal(/Atendimento confirmado/.test(reply), status === 'confirmed');
  }
});
test('outgoing confirmation echoes are ignored without dispatching or responding', async () => {
  const { handleConfirmation } = require('../src/services/sellerIdentityService');
  assert.equal(await handleConfirmation({ command: { chatId: null }, fromMe: true, confirm: () => assert.fail(), send: () => assert.fail() }), true);
});
