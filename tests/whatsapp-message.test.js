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

test('cleans and normalizes audio mime types', () => {
  const { cleanMimeType } = require('../src/services/audioTranscriptionService');
  assert.equal(cleanMimeType('audio/ogg; codecs=opus'), 'audio/ogg');
  assert.equal(cleanMimeType('audio/opus'), 'audio/ogg');
  assert.equal(cleanMimeType('audio/mp4'), 'audio/mp4');
  assert.equal(cleanMimeType('audio/m4a'), 'audio/mp4');
  assert.equal(cleanMimeType('audio/mp3'), 'audio/mp3');
  assert.equal(cleanMimeType('unknown/format'), 'audio/ogg');
  assert.equal(cleanMimeType(null), 'audio/ogg');
});

test('transcribeAudio returns null gracefully when media or key is missing', async () => {
  const { transcribeAudio } = require('../src/services/audioTranscriptionService');
  assert.equal(await transcribeAudio(null, 'comp_1'), null);
  assert.equal(await transcribeAudio({ mediaType: 'image' }, 'comp_1'), null);
  assert.equal(await transcribeAudio({ mediaType: 'audio', buffer: Buffer.from('') }, 'comp_1'), null);
});
