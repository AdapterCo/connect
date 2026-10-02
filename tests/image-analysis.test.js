const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('./helpers/memory-prisma');
install();
let calls = 0, pending = null;
require.cache[require.resolve('@google/generative-ai')] = { exports: { GoogleGenerativeAI: class {
  getGenerativeModel(config) {
    assert.equal(config.generationConfig.maxOutputTokens, 512);
    return { generateContent: async (parts, options) => {
      calls++;
      assert.equal(parts[0].inlineData.mimeType, 'image/png');
      assert.equal(options.timeout, 15000);
      if (pending) await pending;
      return { response: { text: () => 'Descricao de teste' } };
    } };
  }
} } };
const { describeImage } = require('../src/services/imageAnalysisService');
const image = { mediaType: 'image', mimetype: 'image/png', buffer: Buffer.from('synthetic-image') };
const settings = { ai_enabled: true, gemini_key: 'synthetic-test-key' };
test.beforeEach(() => { calls = 0; pending = null; process.env.VISION_ENABLED = 'false'; });
test('vision is disabled by default and makes no API call', async () => {
  assert.equal(await describeImage(image, settings, 'c1'), null);
  assert.equal(calls, 0);
});
test('vision uses configured Gemini with bounded response and timeout', async () => {
  process.env.VISION_ENABLED = 'true';
  assert.equal(await describeImage(image, settings, 'c1'), 'Descricao de teste');
  assert.equal(calls, 1);
});
test('vision rejects large images and unsupported media before API work', async () => {
  process.env.VISION_ENABLED = 'true';
  assert.equal(await describeImage({ ...image, buffer: Buffer.alloc(5 * 1024 * 1024 + 1) }, settings, 'c1'), null);
  assert.equal(await describeImage({ ...image, mediaType: 'video' }, settings, 'c1'), null);
  assert.equal(calls, 0);
});
test('vision limits concurrent calls for the same company', async () => {
  process.env.VISION_ENABLED = 'true';
  let release; pending = new Promise(resolve => { release = resolve; });
  const first = describeImage(image, settings, 'c1');
  assert.equal(await describeImage(image, settings, 'c1'), null);
  release();
  assert.equal(await first, 'Descricao de teste');
  assert.equal(calls, 1);
});
