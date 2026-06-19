const { prisma } = require('../config/database');
const Log = require('../models/Log');
const { encrypt, decrypt } = require('../utils/crypto');

const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const AI_PROVIDERS = new Set(['mock', 'gemini', 'openai', 'groq']);

function normalizeProvider(provider) {
  if (provider === 'grok') return 'groq';
  return provider || 'mock';
}

function normalizeModel(model) {
  if (model === 'grok-beta' || model === 'grok-4.3') return DEFAULT_GROQ_MODEL;
  return model || DEFAULT_GROQ_MODEL;
}

function toClientSettings(settings, company) {
  const groqKey = settings.grok_key ? decrypt(settings.grok_key) : '';
  const groqModel = normalizeModel(settings.grok_model);

  return {
    ...settings,
    ai_provider: normalizeProvider(settings.ai_provider),
    gemini_key: settings.gemini_key ? decrypt(settings.gemini_key) : '',
    openai_key: settings.openai_key ? decrypt(settings.openai_key) : '',
    grok_key: groqKey,
    grok_model: groqModel,
    groq_key: groqKey,
    groq_model: groqModel,
    mp_enabled: company?.mp_enabled || false,
    mp_access_token: company?.mp_access_token ? decrypt(company.mp_access_token) : '',
    mp_public_key: company?.mp_public_key || ''
  };
}

async function getSettings(req, res) {
  try {
    const companyId = req.user.company_id;

    // FIX SEGURANÇA: Nunca fazer fallback para comp_default.
    // Isso vazava as API keys do administrador da plataforma para qualquer novo tenant.
    const settings = await prisma.settings.findUnique({
      where: { company_id: companyId }
    });

    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });

    // Se não houver settings para esta empresa, retornar defaults vazios (sem keys de outra empresa)
    const safeSettings = settings || {
      id: null,
      company_id: companyId,
      ai_enabled: false,
      ai_provider: 'mock',
      gemini_key: null,
      openai_key: null,
      grok_key: null,
      gemini_model: 'gemini-2.5-flash',
      openai_model: 'gpt-4o-mini',
      grok_model: DEFAULT_GROQ_MODEL,
      system_prompt: ''
    };

    const result = toClientSettings(safeSettings, company);

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar configurações.' });
  }
}

async function updateSettings(req, res) {
  try {
    const companyId = req.user.company_id;
    const data = req.body;
    const aiProvider = data.ai_provider !== undefined ? normalizeProvider(data.ai_provider) : undefined;
    const groqKey = data.groq_key !== undefined ? data.groq_key : data.grok_key;
    const groqModel = data.groq_model !== undefined ? data.groq_model : data.grok_model;

    if (aiProvider !== undefined && !AI_PROVIDERS.has(aiProvider)) {
      return res.status(400).json({ error: 'Provedor de IA inválido.' });
    }

    const updateData = {
      ai_enabled: data.ai_enabled !== undefined ? data.ai_enabled : undefined,
      ai_provider: aiProvider,
      gemini_model: data.gemini_model !== undefined ? data.gemini_model : undefined,
      openai_model: data.openai_model !== undefined ? data.openai_model : undefined,
      grok_model: groqModel !== undefined ? normalizeModel(groqModel) : undefined,
      system_prompt: data.system_prompt !== undefined ? data.system_prompt : undefined
    };

    if (data.gemini_key !== undefined) updateData.gemini_key = encrypt(data.gemini_key);
    if (data.openai_key !== undefined) updateData.openai_key = encrypt(data.openai_key);
    if (groqKey !== undefined) updateData.grok_key = encrypt(groqKey);

    const settings = await prisma.settings.upsert({
      where: { company_id: companyId },
      update: updateData,
      create: {
        company_id: companyId,
        ai_enabled: data.ai_enabled || false,
        ai_provider: aiProvider || 'mock',
        gemini_key: data.gemini_key ? encrypt(data.gemini_key) : null,
        openai_key: data.openai_key ? encrypt(data.openai_key) : null,
        grok_key: groqKey ? encrypt(groqKey) : null,
        gemini_model: data.gemini_model || 'gemini-2.5-flash',
        openai_model: data.openai_model || 'gpt-4o-mini',
        grok_model: normalizeModel(groqModel),
        system_prompt: data.system_prompt || ''
      }
    });

    if (data.mp_enabled !== undefined || data.mp_access_token !== undefined || data.mp_public_key !== undefined) {
      const companyUpdate = {};
      if (data.mp_enabled !== undefined) companyUpdate.mp_enabled = data.mp_enabled;
      // FIX SEGURANÇA: Encriptar mp_access_token antes de persistir no banco
      if (data.mp_access_token !== undefined) {
        companyUpdate.mp_access_token = data.mp_access_token ? encrypt(data.mp_access_token) : null;
      }
      if (data.mp_public_key !== undefined) companyUpdate.mp_public_key = data.mp_public_key || null;

      await prisma.company.update({
        where: { id: companyId },
        data: companyUpdate
      });
    }

    await Log.add(`Configurações de sistema atualizadas por ${req.user.name}.`, companyId);

    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });

    const result = toClientSettings(settings, company);

    res.json({ success: true, settings: result });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar configurações.' });
  }
}

module.exports = {
  getSettings,
  updateSettings
};
