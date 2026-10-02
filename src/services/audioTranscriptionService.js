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

const busy = new Set();
async function transcribeAudio(mediaInfo, companyId) {
  if (busy.has(companyId)) return null;
  busy.add(companyId);
  try { return await transcribeAudioImpl(mediaInfo, companyId); } finally { busy.delete(companyId); }
}
async function transcribeAudioImpl(mediaInfo, companyId) {
  if (!mediaInfo || mediaInfo.mediaType !== 'audio') return null;

  try {
    let geminiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || '';
    let preferredModel = 'gemini-2.5-flash';

    if (prisma.settings) {
      try {
        const settings = await prisma.settings.findFirst({
          where: { company_id: companyId }
        });
        if (settings?.gemini_key) {
          try {
            const decrypted = decrypt(settings.gemini_key);
            if (decrypted) geminiKey = decrypted;
          } catch {}
        }
        if (settings?.gemini_model) {
          preferredModel = settings.gemini_model;
        }
      } catch {}
    }

    if (!geminiKey) {
      return null;
    }

    let buffer = mediaInfo.buffer;
    if (!buffer && mediaInfo.savePath && fs.existsSync(mediaInfo.savePath)) {
      buffer = await fs.promises.readFile(mediaInfo.savePath);
    } else if (!buffer && mediaInfo.fileName) {
      const filePath = path.join(UPLOAD_DIR, mediaInfo.fileName);
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
