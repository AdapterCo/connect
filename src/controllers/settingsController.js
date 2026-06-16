const { prisma } = require('../config/database');
const Log = require('../models/Log');
const { encrypt, decrypt } = require('../utils/crypto');

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
      grok_model: 'grok-beta',
      system_prompt: ''
    };

    const result = {
      ...safeSettings,
      gemini_key: safeSettings.gemini_key ? decrypt(safeSettings.gemini_key) : '',
      openai_key: safeSettings.openai_key ? decrypt(safeSettings.openai_key) : '',
      grok_key: safeSettings.grok_key ? decrypt(safeSettings.grok_key) : '',
      mp_enabled: company?.mp_enabled || false,
      // FIX SEGURANÇA: mp_access_token agora é encriptado no banco; descriptografar na leitura
      mp_access_token: company?.mp_access_token ? decrypt(company.mp_access_token) : '',
      mp_public_key: company?.mp_public_key || ''
    };

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar configurações.' });
  }
}

async function updateSettings(req, res) {
  try {
    const companyId = req.user.company_id;
    const data = req.body;

    const updateData = {
      ai_enabled: data.ai_enabled !== undefined ? data.ai_enabled : undefined,
      ai_provider: data.ai_provider !== undefined ? data.ai_provider : undefined,
      gemini_model: data.gemini_model !== undefined ? data.gemini_model : undefined,
      openai_model: data.openai_model !== undefined ? data.openai_model : undefined,
      grok_model: data.grok_model !== undefined ? data.grok_model : undefined,
      system_prompt: data.system_prompt !== undefined ? data.system_prompt : undefined
    };

    if (data.gemini_key !== undefined) updateData.gemini_key = encrypt(data.gemini_key);
    if (data.openai_key !== undefined) updateData.openai_key = encrypt(data.openai_key);
    if (data.grok_key !== undefined) updateData.grok_key = encrypt(data.grok_key);

    const settings = await prisma.settings.upsert({
      where: { company_id: companyId },
      update: updateData,
      create: {
        company_id: companyId,
        ai_enabled: data.ai_enabled || false,
        ai_provider: data.ai_provider || 'mock',
        gemini_key: data.gemini_key ? encrypt(data.gemini_key) : null,
        openai_key: data.openai_key ? encrypt(data.openai_key) : null,
        grok_key: data.grok_key ? encrypt(data.grok_key) : null,
        gemini_model: data.gemini_model || 'gemini-2.5-flash',
        openai_model: data.openai_model || 'gpt-4o-mini',
        grok_model: data.grok_model || 'grok-beta',
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

    const result = {
      ...settings,
      gemini_key: settings.gemini_key ? decrypt(settings.gemini_key) : '',
      openai_key: settings.openai_key ? decrypt(settings.openai_key) : '',
      grok_key: settings.grok_key ? decrypt(settings.grok_key) : '',
      mp_enabled: company?.mp_enabled || false,
      mp_access_token: company?.mp_access_token ? decrypt(company.mp_access_token) : '',
      mp_public_key: company?.mp_public_key || ''
    };

    res.json({ success: true, settings: result });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar configurações.' });
  }
}

module.exports = {
  getSettings,
  updateSettings
};
