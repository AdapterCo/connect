const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Carregar o historico inteiro a cada evento derrubava a RAM/CPU da VPS.
test('hot paths load only a recent message window, oldest first', () => {
  const { RECENT_MESSAGES, RECENT_MESSAGE_LIMIT } = require('../src/utils/recentMessages');
  assert.equal(RECENT_MESSAGES.take, -RECENT_MESSAGE_LIMIT);
  assert.ok(RECENT_MESSAGE_LIMIT >= 50, 'socket emits the last 50 and AI/qualification read up to 20');
  for (const file of ['src/models/Chat.js', 'src/services/salesRotationService.js', 'src/services/chatIdentityService.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.doesNotMatch(source, /messages:\s*\{\s*orderBy:\s*\{\s*timestamp:\s*'asc'\s*\}\s*\}/, file);
  }
});

test('WhatsApp pairing does not request the full chat history', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src/services/whatsappService.js'), 'utf8');
  assert.match(source, /syncFullHistory:\s*false/);
});
