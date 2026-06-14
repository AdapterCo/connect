const auditService = require('../services/auditService');

function audit(entity, action) {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = function (data) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const companyId = req.user?.company_id || req.companyId;
        if (companyId) {
          auditService.log({
            company_id: companyId,
            user_id: req.user?.id || null,
            user_name: req.user?.name || req.user?.username || null,
            action,
            entity,
            entity_id: req.params.id || data?.id || data?.chat?.id || null,
            details: JSON.stringify({
              method: req.method,
              path: req.originalUrl,
              body: sanitizeBody(req.body),
              statusCode: res.statusCode
            }),
            ip: req.ip || req.connection?.remoteAddress || null,
            user_agent: req.headers['user-agent'] || null
          }).catch(err => console.error('Audit log error:', err));
        }
      }

      return originalJson(data);
    };

    next();
  };
}

function sanitizeBody(body) {
  if (!body) return null;
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'adminPassword', 'token', 'secret', 'key', 'access_token', 'mp_access_token', 'gemini_key', 'openai_key', 'grok_key'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '***';
    }
  });
  return sanitized;
}

module.exports = audit;
