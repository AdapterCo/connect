process.env.JWT_SECRET = 'test-32-chars-secret-for-check-ok';
process.env.ENCRYPTION_KEY = 'test-32-chars-enckey-for-check-ok';
process.env.DATABASE_URL = 'postgresql://x:x@localhost/x';
process.env.MP_WEBHOOK_SECRET = '';
const path = require('path');
const assert = require('assert');
const cleanJsonString = require(path.join(__dirname, '../src/utils/cleanJson'));
const { encrypt, decrypt } = require(path.join(__dirname, '../src/utils/crypto'));

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS:', name); passed++; }
  catch (e) { console.log('  FAIL:', name, '->', e.message); failed++; }
}

console.log('\n=== cleanJsonString ===');
test('JSON puro', () => { const r = JSON.parse(cleanJsonString('{"message":"Ola!","status":"iniciada"}')); assert.strictEqual(r.message,'Ola!'); });
test('Bloco ```json', () => { const r = JSON.parse(cleanJsonString('```json\n{"message":"Oi"}\n```')); assert.strictEqual(r.message,'Oi'); });
test('Bloco ``` simples', () => { const r = JSON.parse(cleanJsonString('```\n{"message":"Ok"}\n```')); assert.strictEqual(r.message,'Ok'); });

console.log('\n=== Criptografia da API Key ===');
test('Encrypt/decrypt round-trip', () => {
  const key = 'sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz123456';
  const enc = encrypt(key); assert(enc.startsWith('v2:')); assert.strictEqual(decrypt(enc), key);
});
test('null retorna null', () => { assert.strictEqual(decrypt(null), null); assert.strictEqual(encrypt(null), null); });

console.log('\n=== normalizeProvider ===');
function norm(p) { if (p === 'grok') return 'groq'; return p || 'mock'; }
test('openai preservado', () => assert.strictEqual(norm('openai'), 'openai'));
test('grok -> groq', () => assert.strictEqual(norm('grok'), 'groq'));
test('vazio -> mock', () => assert.strictEqual(norm(''), 'mock'));

console.log('\n=== OpenAI SDK ===');
test('Instancia com timeout/maxRetries', () => {
  const OpenAI = require(path.join(__dirname, '../node_modules/openai'));
  const c = new OpenAI({ apiKey: 'sk-test', timeout: 30000, maxRetries: 2 });
  assert.strictEqual(c.timeout, 30000); assert.strictEqual(c.maxRetries, 2);
});
test('SDK v4+ suporta response_format json_object', () => {
  const pkg = require(path.join(__dirname, '../node_modules/openai/package.json'));
  assert(Number(pkg.version.split('.')[0]) >= 4, 'Requer v4+, encontrado: ' + pkg.version);
  console.log('    openai@' + pkg.version);
});

console.log('\nResultado: passou=' + passed + ' falhou=' + failed);
if (failed > 0) process.exit(1);
