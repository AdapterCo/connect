const { prisma } = require('../config/database');
const Log = require('../models/Log');
const { encrypt, decrypt } = require('../utils/crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

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

async function testAiKey(req, res) {
  try {
    const companyId = req.user.company_id;
    const { provider, key, model } = req.body;

    if (!provider || !key) {
      return res.status(400).json({ ok: false, error: 'Provedor e chave sao obrigatorios.' });
    }

    if (provider === 'openai') {
      const openai = new OpenAI({ apiKey: key, timeout: 15_000, maxRetries: 0 });
      try {
        const resp = await openai.chat.completions.create({
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'responda apenas com o json: {"ok":true}' }],
          response_format: { type: 'json_object' },
          max_tokens: 20
        });
        const text = resp.choices?.[0]?.message?.content || '{}';
        await Log.add(`Teste de chave OpenAI realizado com sucesso por ${req.user.name}.`, companyId);
        return res.json({ ok: true, model: model || 'gpt-4o-mini', response: text });
      } catch (err) {
        const status = err.status || err.statusCode;
        const code = err.code || err.error?.code;
        const msg = err.error?.message || err.message || String(err);
        const detail = [status && `HTTP ${status}`, code, msg].filter(Boolean).join(' | ');
        return res.json({ ok: false, error: detail });
      }
    }

    if (provider === 'gemini') {
      const { GoogleGenerativeAI: GGA } = require('@google/generative-ai');
      try {
        const genAI = new GGA(key);
        const mdl = genAI.getGenerativeModel(
          { model: model || 'gemini-2.5-flash', generationConfig: { responseMimeType: 'application/json' } },
          { apiVersion: 'v1beta' }
        );
        const result = await mdl.generateContent('responda apenas com o json: {"ok":true}');
        const text = result.response.text();
        await Log.add(`Teste de chave Gemini realizado com sucesso por ${req.user.name}.`, companyId);
        return res.json({ ok: true, model: model || 'gemini-2.5-flash', response: text });
      } catch (err) {
        const msg = err.message || String(err);
        return res.json({ ok: false, error: msg });
      }
    }

    if (provider === 'groq') {
      const groq = new OpenAI({
        apiKey: key,
        baseURL: 'https://api.groq.com/openai/v1',
        timeout: 15_000,
        maxRetries: 0
      });
      try {
        const resp = await groq.chat.completions.create({
          model: model || 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'responda apenas com o json: {"ok":true}' }],
          response_format: { type: 'json_object' },
          max_tokens: 20
        });
        const text = resp.choices?.[0]?.message?.content || '{}';
        await Log.add(`Teste de chave Groq realizado com sucesso por ${req.user.name}.`, companyId);
        return res.json({ ok: true, model: model || 'llama-3.3-70b-versatile', response: text });
      } catch (err) {
        const status = err.status || err.statusCode;
        const msg = err.error?.message || err.message || String(err);
        const detail = [status && `HTTP ${status}`, msg].filter(Boolean).join(' | ');
        return res.json({ ok: false, error: detail });
      }
    }

    return res.status(400).json({ ok: false, error: 'Provedor nao suportado: ' + provider });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'Erro interno ao testar chave: ' + error.message });
  }
}

module.exports = {
  getSettings,
  updateSettings,
  testAiKey
};
