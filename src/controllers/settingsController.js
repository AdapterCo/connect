const { prisma } = require('../config/database');
const Log = require('../models/Log');
const { encrypt } = require('../utils/crypto');

async function getSettings(req, res) {
  try {
    const companyId = req.user.company_id;
    let settings = await prisma.settings.findUnique({
      where: { company_id: companyId }
    });

    const result = {
      ...settings,
      gemini_key: '',
      openai_key: '',
      grok_key: '',
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

    if (data.gemini_key) updateData.gemini_key = encrypt(data.gemini_key);
    if (data.openai_key) updateData.openai_key = encrypt(data.openai_key);
    if (data.grok_key) updateData.grok_key = encrypt(data.grok_key);

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

    await Log.add(`Configurações de sistema atualizadas por ${req.user.name}.`, companyId);

    const result = {
      ...settings,
      gemini_key: '',
      openai_key: '',
      grok_key: '',
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
