const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Resposta manual pelo celular da loja nao pode desligar a IA da conversa.
test('manual replies from the store phone keep the AI on; seller chips stay AI-free', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/services/whatsappService.js'), 'utf8');
  const branch = source.slice(source.indexOf('if (msg.key?.fromMe) {'), source.indexOf("const resolvedText = text || (mediaInfo"));
  assert.ok(branch.length > 0);
  assert.doesNotMatch(branch, /ai_active:\s*false\s*[,}\n]/);
  assert.match(branch, /ai_active:\s*!inst\?\.user_id/);
  assert.match(branch, /inst\?\.user_id \? \{ ai_active: false \} : \{\}/);
});
