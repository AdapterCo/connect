const privacyService = require('../services/privacyService');

async function exportClientData(req, res) {
  try {
    const result = await privacyService.exportClientData({
      companyId: req.user.company_id,
      chatId: req.params.chatId,
      actor: req.user
    });

    if (!result) {
      return res.status(404).json({ error: 'Cliente nao encontrado.' });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao exportar dados do cliente.' });
  }
}

async function anonymizeClientData(req, res) {
  try {
    const result = await privacyService.anonymizeClientData({
      companyId: req.user.company_id,
      chatId: req.params.chatId,
      actor: req.user
    });

    if (!result) {
      return res.status(404).json({ error: 'Cliente nao encontrado.' });
    }

    res.json({ success: true, chat: result });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao anonimizar dados do cliente.' });
  }
}

async function deleteClientData(req, res) {
  try {
    const deleted = await privacyService.deleteClientData({
      companyId: req.user.company_id,
      chatId: req.params.chatId,
      actor: req.user
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Cliente nao encontrado.' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir dados do cliente.' });
  }
}

module.exports = {
  exportClientData,
  anonymizeClientData,
  deleteClientData
};
