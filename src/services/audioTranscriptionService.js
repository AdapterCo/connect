const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { prisma } = require('../config/database');
const { decrypt } = require('../utils/crypto');
const { UPLOAD_DIR } = require('../config/index');
const Log = require('../models/Log');

function cleanMimeType(mimeType) {
  if (!mimeType) return 'audio/ogg';
  const clean = mimeType.split(';')[0].trim().toLowerCase();
  if (clean === 'audio/opus') return 'audio/ogg';
  if (['audio/ogg', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/m4a'].includes(clean)) {
    return clean === 'audio/m4a' ? 'audio/mp4' : clean;
  }
  return 'audio/ogg';
}

// Ate MAX_CONCURRENT transcricoes por empresa; as demais aguardam numa fila
// curta em vez de serem descartadas. Acima de MAX_QUEUED o audio fica sem texto.
const MAX_CONCURRENT = 3;
const MAX_QUEUED = 20;
const slots = new Map();

function acquireSlot(companyId) {
  const slot = slots.get(companyId) || { running: 0, waiting: [] };
  slots.set(companyId, slot);
  if (slot.running < MAX_CONCURRENT) {
    slot.running++;
    return Promise.resolve(true);
  }
  if (slot.waiting.length >= MAX_QUEUED) return Promise.resolve(false);
  return new Promise(resolve => slot.waiting.push(() => resolve(true)));
}

function releaseSlot(companyId) {
  const slot = slots.get(companyId);
  if (!slot) return;
  const next = slot.waiting.shift();
  if (next) return next();
  slot.running--;
  if (!slot.running) slots.delete(companyId);
}

async function transcribeAudio(mediaInfo, companyId) {
  if (!mediaInfo || mediaInfo.mediaType !== 'audio') return null;
  if (!await acquireSlot(companyId)) {
    console.warn('[GeminiAudio] Fila de transcricao cheia; audio sem transcricao.');
    return null;
  }
  try { return await transcribeAudioImpl(mediaInfo, companyId); } finally { releaseSlot(companyId); }
}

// O audio do cliente so vai para o Gemini quando a empresa ativou a IA e
// cadastrou a propria chave: nada de chave da plataforma nem envio sem opcao.
async function companyGeminiConfig(companyId) {
  const settings = await prisma.settings.findFirst({ where: { company_id: companyId } });
  if (!settings?.ai_enabled || !settings.gemini_key) return null;
  let key = '';
  try { key = decrypt(settings.gemini_key) || ''; } catch { return null; }
  return key ? { key, model: settings.gemini_model || 'gemini-2.5-flash' } : null;
}

async function transcribeAudioImpl(mediaInfo, companyId) {
  try {
    const config = await companyGeminiConfig(companyId);
    if (!config) return null;
    const geminiKey = config.key;
    const preferredModel = config.model;

    let buffer = mediaInfo.buffer;
    if (!buffer && mediaInfo.savePath && fs.existsSync(mediaInfo.savePath)) {
      buffer = await fs.promises.readFile(mediaInfo.savePath);
    } else if (!buffer && mediaInfo.fileName) {
      const filePath = path.join(UPLOAD_DIR, path.basename(String(mediaInfo.fileName)));
      if (fs.existsSync(filePath)) {
        buffer = await fs.promises.readFile(filePath);
      }
    } else if (!buffer && mediaInfo.mediaUrl) {
      const baseName = path.basename(mediaInfo.mediaUrl);
      const filePath = path.join(UPLOAD_DIR, baseName);
      if (fs.existsSync(filePath)) {
        buffer = await fs.promises.readFile(filePath);
      }
    }

    if (!buffer || buffer.length === 0 || buffer.length > 10 * 1024 * 1024) {
      return null;
    }

    const mimeType = cleanMimeType(mediaInfo.mimetype);
    const genAI = new GoogleGenerativeAI(geminiKey);
    const modelsToTry = [preferredModel, 'gemini-2.5-flash'];
    const seen = new Set();
    const candidateModels = modelsToTry.filter(m => {
      if (seen.has(m)) return false;
      seen.add(m);
      return true;
    });

    for (const modelId of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelId });
        const result = await require('../utils/timeout').withTimeout(model.generateContent([
          {
            inlineData: {
              mimeType,
              data: buffer.toString('base64')
            }
          },
          {
            text: 'Transcreva este áudio em português de forma literal e precisa. Retorne SOMENTE o texto falado, sem aspas, sem introduções e sem comentários adicionais.'
          }
        ], { timeout: 15000 }), 16000);

        const rawText = result?.response?.text?.();
        if (typeof rawText === 'string' && rawText.trim()) {
          const cleanText = rawText.trim().replace(/^["']|["']$/g, '');
          if (cleanText) {
            await Log.add(`Audio transcrito via Gemini (${modelId}).`, companyId).catch(() => {});
            return cleanText;
          }
        }
      } catch (genErr) {
        console.warn(`[GeminiAudio] Falha no modelo ${modelId}:`, genErr?.code || genErr?.name);
      }
    }
  } catch (err) {
    console.error('[GeminiAudio] Erro geral na transcrição de áudio:', err?.code || err?.name);
  }

  return null;
}

module.exports = {
  transcribeAudio,
  cleanMimeType
};
