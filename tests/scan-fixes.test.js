const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-quota-'));
process.env.UPLOAD_DIR = uploadDir;
process.env.MEDIA_QUOTA_MB = '1';
const { db, reset, install } = require('./helpers/memory-prisma');
install();
delete process.env.GEMINI_API_KEY;
delete process.env.GEMINI_KEY;

// SDK do Gemini substituido: conta as chamadas e simula a latencia da API.
let geminiCalls = 0;
let running = 0;
let maxRunning = 0;
require.cache[require.resolve('@google/generative-ai')] = {
  exports: {
    GoogleGenerativeAI: function GoogleGenerativeAI() {
      return {
        getGenerativeModel: () => ({
          generateContent: async () => {
            geminiCalls++;
            running++;
            maxRunning = Math.max(maxRunning, running);
            await new Promise(resolve => setTimeout(resolve, 20));
            running--;
            return { response: { text: () => 'quero a moto vermelha' } };
          }
        })
      };
    }
  }
};

const { encrypt } = require('../src/utils/crypto');
const { transcribeAudio } = require('../src/services/audioTranscriptionService');
const { checkQuota } = require('../src/services/mediaStorageService');

test.after(() => fs.rmSync(uploadDir, { recursive: true, force: true }));

const audio = () => ({ mediaType: 'audio', mimetype: 'audio/ogg', buffer: Buffer.from('OggS-audio') });

function seedSettings(settings) {
  reset();
  db.settings.push({ id: 'st1', company_id: 'c1', gemini_model: 'gemini-2.5-flash', ...settings });
  geminiCalls = 0;
}

test('customer audio is not sent to the AI provider unless the company enabled AI with its own key', async () => {
  process.env.GEMINI_API_KEY = 'chave-da-plataforma';
  try {
    seedSettings({ ai_enabled: false, gemini_key: encrypt('chave-da-empresa') });
    assert.equal(await transcribeAudio(audio(), 'c1'), null);

    seedSettings({ ai_enabled: true, gemini_key: null });
    assert.equal(await transcribeAudio(audio(), 'c1'), null, 'a chave da plataforma nunca e usada');

    assert.equal(geminiCalls, 0);
  } finally {
    delete process.env.GEMINI_API_KEY;
  }

  seedSettings({ ai_enabled: true, gemini_key: encrypt('chave-da-empresa') });
  assert.equal(await transcribeAudio(audio(), 'c1'), 'quero a moto vermelha');
  assert.equal(geminiCalls, 1);
});

test('simultaneous audios from one company are all transcribed, at most three at a time', async () => {
  seedSettings({ ai_enabled: true, gemini_key: encrypt('chave-da-empresa') });
  maxRunning = 0;
  const results = await Promise.all(Array.from({ length: 6 }, () => transcribeAudio(audio(), 'c1')));
  assert.deepEqual(results, Array(6).fill('quero a moto vermelha'));
  assert.equal(maxRunning, 3);
});

test('media quota keeps usage in memory between scans and still blocks overflow', async () => {
  reset();
  const tenant = require('../src/services/mediaStorageService').tenantPrefix('c2');
  fs.writeFileSync(path.join(uploadDir, `${tenant}_existente.jpg`), Buffer.alloc(300 * 1024));

  // Primeira chamada varre a pasta (300 KB) e soma o arquivo novo (400 KB).
  await checkQuota('c2', 400 * 1024);
  // Sem nova varredura, o uso acumulado (700 KB) + 400 KB passa de 1 MB.
  await assert.rejects(checkQuota('c2', 400 * 1024), error => error.status === 413);
  // Um arquivo pequeno ainda cabe.
  await checkQuota('c2', 100 * 1024);
});

test('uploaded files already on disk are not counted twice on a fresh scan', async () => {
  reset();
  const tenant = require('../src/services/mediaStorageService').tenantPrefix('c3');
  fs.writeFileSync(path.join(uploadDir, `${tenant}_novo.jpg`), Buffer.alloc(700 * 1024));
  // 700 KB ja gravados: contar de novo daria 1,4 MB e bloquearia por engano.
  await checkQuota('c3', 700 * 1024, { stored: true });
});
