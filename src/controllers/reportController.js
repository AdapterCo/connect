const metricsService = require('../services/metricsService');
const Log = require('../models/Log');

async function getStatistics(req, res) {
  try {
    const stats = await metricsService.getStatistics(req.user.company_id);
    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao compilar estatísticas.' });
  }
}

async function getLogs(req, res) {
  try {
    const logs = await Log.findAll(req.user.company_id);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar logs.' });
  }
}

async function clearLogs(req, res) {
  try {
    await Log.clear(req.user.company_id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao limpar logs.' });
  }
}

module.exports = {
  getStatistics,
  getLogs,
  clearLogs
};
