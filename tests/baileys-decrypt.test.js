const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const entry = process.env.BAILEYS_TEST_ENTRY || require.resolve('@whiskeysockets/baileys');
const lib = path.dirname(entry);
const baileysPromise = import(pathToFileURL(entry).href);
const modulePromise = baileysPromise.then(() => import(pathToFileURL(path.join(lib, 'Utils/decode-wa-message.js')).href));
const protoPromise = baileysPromise.then(({ proto }) => ({ proto }));
const PN = '5521959343672@s.whatsapp.net', LID = '202147551526944@lid';
const ME = '5521999999999@s.whatsapp.net', ME_LID = '111111111111111@lid';

async function decode(attrs, succeedsAt, type = 'msg', meId = ME, meLid = ME_LID) {
  const { decryptMessageNode } = await modulePromise;
  const { proto } = await protoPromise;
  const calls = [];
  const message = Buffer.concat([proto.Message.encode({ conversation: 'CONFIRMAR' }).finish(), Buffer.from([1])]);
  const originalError = new Error('Bad MAC');
  const repository = { decryptMessage: async args => { calls.push(args.jid); if (args.jid !== succeedsAt) throw originalError; return message; } };
  const stanza = { tag: 'message', attrs: { id: 'test-message', t: '1791334800', ...attrs }, content: [{ tag: 'enc', attrs: { type }, content: Buffer.from([1, 2]) }] };
  const result = decryptMessageNode(stanza, meId, meLid, repository, { debug() {}, error() {} });
  await result.decrypt();
  return { result: result.fullMessage, calls };
}

test('a failed LID session recovers the actual message using the WhatsApp paired phone', async () => {
  const { result, calls } = await decode({ from: LID, sender_pn: PN }, PN);
  assert.deepEqual(calls, [LID, PN]); assert.equal(result.message.conversation, 'CONFIRMAR'); assert.equal(result.messageStubType, undefined);
});
test('a failed phone session also recovers using the paired LID', async () => {
  const { result, calls } = await decode({ from: PN, sender_lid: LID }, LID, 'pkmsg');
  assert.deepEqual(calls, [PN, LID]); assert.equal(result.message.conversation, 'CONFIRMAR');
});
test('an already valid session is decrypted once without changing identities', async () => {
  const { result, calls } = await decode({ from: LID, sender_pn: PN }, LID);
  assert.deepEqual(calls, [LID]); assert.equal(result.message.conversation, 'CONFIRMAR');
});
test('an unknown alternate is never guessed and the original crypto failure is retained', async () => {
  const missing = await decode({ from: LID }, PN);
  assert.deepEqual(missing.calls, [LID]); assert.equal(missing.result.message, undefined);
  const failed = await decode({ from: LID, sender_pn: PN }, 'unknown');
  assert.deepEqual(failed.calls, [LID, PN]); assert.deepEqual(failed.result.messageStubParameters, ['Bad MAC']);
});
test('group encryption uses only the sender pairing attached to that stanza', async () => {
  const { result, calls } = await decode({ from: '123456@g.us', participant: LID, participant_pn: PN }, PN);
  assert.deepEqual(calls, [LID, PN]); assert.equal(result.message.conversation, 'CONFIRMAR');
});
test('self sync can use the authenticated phone when the own LID session fails', async () => {
  const { result, calls } = await decode({ from: ME_LID, recipient: PN }, ME);
  assert.equal(result.key.fromMe, true); assert.deepEqual(calls, [ME_LID, ME]); assert.equal(result.message.conversation, 'CONFIRMAR');
});
test('Docker clean installations must include and apply the historical Baileys patch', () => {
  const root = path.resolve(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const docker = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  assert.equal(pkg.dependencies['@whiskeysockets/baileys'], '6.7.23');
  assert.equal(pkg.scripts.postinstall, 'node scripts/apply-baileys-patch.js');
  assert.ok(docker.indexOf('COPY patches/') < docker.lastIndexOf('RUN npm ci'));
  assert.ok(fs.existsSync(path.join(root, 'patches/@whiskeysockets+baileys+6.7.23.patch')));
});


test('install patch rejects changed source and repeated contexts instead of silently omitting the fix', () => {
  const { applyHunks } = require('../scripts/apply-baileys-patch');
  const diff = '@@ -1,2 +1,2 @@\n old\n-broken\n+fixed';
  assert.equal(applyHunks('old\nbroken', diff), 'old\nfixed');
  assert.equal(applyHunks('old\nfixed', diff), 'old\nfixed');
  assert.throws(() => applyHunks('unexpected', diff), /differs/);
  assert.throws(() => applyHunks('old\nbroken\nold\nbroken', diff), /Ambiguous/);
});


test('own LID from primary device uses phone device zero, not linked Connect device 17', async () => {
  const { result, calls } = await decode({ from: ME_LID, recipient: PN }, ME, 'msg', ME.replace('@', ':17@'), ME_LID.replace('@', ':17@'));
  assert.deepEqual(calls, [ME_LID, ME]); assert.equal(result.message.conversation, 'CONFIRMAR');
});
test('own secondary sender device is preserved rather than replaced by Connect device', async () => {
  const ownSender = ME_LID.replace('@', ':3@'), target = ME.replace('@', ':3@');
  const { result, calls } = await decode({ from: ownSender, recipient: PN }, target, 'msg', ME.replace('@', ':17@'), ME_LID.replace('@', ':17@'));
  assert.deepEqual(calls, [ownSender, target]); assert.equal(result.message.conversation, 'CONFIRMAR');
});
test('an explicit WhatsApp identity pairing takes precedence over the own identity fallback', async () => {
  const paired = ME.replace('@', ':4@');
  const { result, calls } = await decode({ from: ME_LID, recipient: PN, sender_pn: paired }, paired, 'msg', ME.replace('@', ':17@'), ME_LID.replace('@', ':17@'));
  assert.deepEqual(calls, [ME_LID, paired]); assert.equal(result.message.conversation, 'CONFIRMAR');
});
