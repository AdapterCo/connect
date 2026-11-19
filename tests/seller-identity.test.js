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
    // No aceite a resposta e a mensagem com os dados do lead, enviada pelo rodizio.
    assert.equal(reply === undefined, status === 'confirmed');
  }
});
test('ACEITAR is the accept command and CONFIRMAR keeps working', () => {
  const { confirmation } = require('../src/services/sellerIdentityService');
  assert.deepEqual(confirmation({ conversation: 'aceitar' }), { chatId: null });
  assert.deepEqual(confirmation({ conversation: 'ACEITAR chat_abc' }), { chatId: 'chat_abc' });
  assert.deepEqual(confirmation({ conversation: 'CONFIRMAR' }), { chatId: null });
  assert.equal(confirmation({ conversation: 'aceito o desconto' }), null);
  for (const text of ['Aceitar.', 'ACEITAR 👍', 'aceitar!!', ' Confirmar ✅ ']) assert.deepEqual(confirmation({ conversation: text }), { chatId: null }, text);
  assert.equal(confirmation({ conversation: 'vou aceitar' }), null);
});
test('outgoing confirmation echoes are ignored without dispatching or responding', async () => {
  const { handleConfirmation } = require('../src/services/sellerIdentityService');
  assert.equal(await handleConfirmation({ command: { chatId: null }, fromMe: true, confirm: () => assert.fail(), send: () => assert.fail() }), true);
});

test('several waiting clients get a numbered list and the seller accepts by number', async () => {
  const { handleConfirmation, confirmation, _pendingChoices } = require('../src/services/sellerIdentityService');
  _pendingChoices.clear();
  const log = { warn() {}, info() {} };
  const leads = [{ id: 'chat_a', client_name: 'Ana', client_phone: '5521984864194' }, { id: 'chat_b', client_name: 'Bruno', client_phone: '5521977771234' }];
  const calls = [];
  let reply;
  const confirm = async (seller, chatId) => { calls.push(chatId); return chatId ? { status: 'confirmed', chats: [{ id: chatId }] } : { status: 'ambiguous', chats: leads, options: leads }; };
  const send = async text => { reply = text; };
  const seller = { id: 's1' };
  await handleConfirmation({ command: confirmation({ conversation: 'Aceitar' }), teamMember: seller, confirm, send, log });
  assert.match(reply, /\*1\* - Ana \(final 4194\)/);
  assert.match(reply, /\*2\* - Bruno \(final 1234\)/);
  assert.doesNotMatch(reply, /chat_/);
  for (const text of ['2', 'ACEITAR 2', 'cliente 2', '2️⃣']) {
    assert.equal(await handleConfirmation({ command: confirmation({ conversation: text }), teamMember: seller, confirm, send, log }), true, text);
    assert.equal(calls.at(-1), 'chat_b', text);
  }
  reply = undefined;
  await handleConfirmation({ command: confirmation({ conversation: '5' }), teamMember: seller, confirm, send, log });
  assert.match(reply, /nao esta na lista/);
});

test('a bare number is a normal message for customers, store echoes and sellers without an open list', async () => {
  const { handleConfirmation, confirmation, _pendingChoices } = require('../src/services/sellerIdentityService');
  _pendingChoices.clear();
  const command = confirmation({ conversation: '1' });
  const fail = () => assert.fail();
  assert.equal(await handleConfirmation({ command, teamMember: null, confirm: fail, send: fail }), false);
  assert.equal(await handleConfirmation({ command, teamMember: { id: 's1' }, confirm: fail, send: fail }), false);
  assert.equal(await handleConfirmation({ command, fromMe: true, teamMember: { id: 's1' }, confirm: fail, send: fail }), false);
  assert.equal(confirmation({ conversation: 'tenho 2 filhos' }), null);
});
