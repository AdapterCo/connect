const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('Baileys 7 is pinned and Docker does not apply a Baileys 6 patch', async () => {
  const project = require('../package.json');
  const lock = require('../package-lock.json');
  assert.equal(project.dependencies['@whiskeysockets/baileys'], '7.0.0-rc14');
  assert.equal(lock.packages['node_modules/@whiskeysockets/baileys'].version, '7.0.0-rc14');
  assert.equal(project.scripts.postinstall, undefined);
  assert.ok(!fs.readFileSync(path.join(__dirname, '../Dockerfile'), 'utf8').includes('apply-baileys-patch'));
  const entry = require.resolve('@whiskeysockets/baileys');
  const api = await import(pathToFileURL(entry).href);
  for (const name of ['default', 'useMultiFileAuthState', 'fetchLatestBaileysVersion', 'generateMessageIDV2', 'downloadMediaMessage']) {
    assert.equal(typeof api[name], 'function', name);
  }
  const decode = await import(pathToFileURL(path.join(path.dirname(entry), 'Utils/decode-wa-message.js')).href);
  const context = decode.extractAddressingContext({ attrs: {
    from: '66791506194465:55@lid', sender_pn: '5521985080634@s.whatsapp.net', addressing_mode: 'lid'
  } });
  assert.equal(context.senderAlt, '5521985080634@s.whatsapp.net');
  const mapped = await decode.getDecryptionJid('5521985080634@s.whatsapp.net', {
    lidMapping: { getLIDForPN: async () => '66791506194465@lid' }
  });
  assert.equal(mapped, '66791506194465@lid');
});
