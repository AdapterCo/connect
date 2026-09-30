const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectIncomingMessage } = require('../src/utils/incomingWhatsAppMessage');

test('retains message content even when Baileys marks the event as a protocol stub', () => {
  const result = inspectIncomingMessage({
    messageStubType: 2,
    message: { conversation: 'mensagem recebida' }
  });

  assert.deepEqual(result.content, { conversation: 'mensagem recebida' });
  assert.equal(result.isEmptyProtocolStub, false);
});

test('recognizes only contentless protocol stubs as ignorable', () => {
  assert.deepEqual(inspectIncomingMessage({ messageStubType: 2, message: null }), {
    content: null,
    isEmptyProtocolStub: true
  });
  assert.deepEqual(inspectIncomingMessage({ message: null }), {
    content: null,
    isEmptyProtocolStub: false
  });
});

test('unwraps ephemeral and view-once messages before processing', () => {
  const result = inspectIncomingMessage({
    messageStubType: 2,
    message: { ephemeralMessage: { message: { conversation: 'texto' } } }
  });

  assert.deepEqual(result.content, { conversation: 'texto' });
  assert.equal(result.isEmptyProtocolStub, false);
});
