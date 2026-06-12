const auditService = require('../services/auditService');

async function getAuditLogs(req, res) {
  try {
    const companyId = req.user.company_id;
    const { action, entity, user_id, from, to, page, limit } = req.query;

    const result = await auditService.getLogs(companyId, {
      action,
      entity,
      user_id,
      from,
      to,
      page,
      limit
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar logs de auditoria.' });
  }
}

async function getAuditStats(req, res) {
  try {
    const companyId = req.user.company_id;
    const stats = await auditService.getLogStats(companyId);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar estatísticas de auditoria.' });
  }
}

module.exports = {
  getAuditLogs,
  getAuditStats
};
