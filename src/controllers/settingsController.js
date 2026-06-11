const { prisma } = require('../config/database');
const Log = require('../models/Log');
const { encrypt, decrypt } = require('../utils/crypto');

async function getSettings(req, res) {
  try {
    const companyId = req.user.company_id;
    let settings = await prisma.settings.findUnique({
      where: { company_id: companyId }
    });

    if (!settings) {
      settings = await prisma.settings.findUnique({
        where: { company_id: 'comp_default' }
      });
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });

    const result = {
      ...settings,
      gemini_key: settings?.gemini_key ? decrypt(settings.gemini_key) : '',
      openai_key: settings?.openai_key ? decrypt(settings.openai_key) : '',
      grok_key: settings?.grok_key ? decrypt(settings.grok_key) : '',
      mp_enabled: company?.mp_enabled || false,
      mp_access_token: company?.mp_access_token || '',
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
        ai_provider: data.ai_provider || 'gemini',
        gemini_key: data.gemini_key ? encrypt(data.gemini_key) : null,
        openai_key: data.openai_key ? encrypt(data.openai_key) : null,
        grok_key: data.grok_key ? encrypt(data.grok_key) : null,
        gemini_model: data.gemini_model || 'gemini-2.5-flash',
        openai_model: data.openai_model || 'gpt-4o-mini',
        grok_model: data.grok_model || 'grok-4.3',
        system_prompt: data.system_prompt || ''
      }
    });

    if (data.mp_enabled !== undefined || data.mp_access_token !== undefined || data.mp_public_key !== undefined) {
      const companyUpdate = {};
      if (data.mp_enabled !== undefined) companyUpdate.mp_enabled = data.mp_enabled;
      if (data.mp_access_token !== undefined) companyUpdate.mp_access_token = data.mp_access_token;
      if (data.mp_public_key !== undefined) companyUpdate.mp_public_key = data.mp_public_key;

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
      mp_access_token: company?.mp_access_token || '',
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
