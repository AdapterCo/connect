const { prisma } = require('../config/database');

function getRetentionConfig() {
  return {
    enabled: process.env.RETENTION_ENABLED === 'true',
    auditLogDays: Number(process.env.AUDIT_LOG_RETENTION_DAYS || 365),
    systemLogDays: Number(process.env.SYSTEM_LOG_RETENTION_DAYS || 180),
    messageDays: Number(process.env.MESSAGE_RETENTION_DAYS || 0)
  };
}

function cutoffDate(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

async function applyRetentionPolicy() {
  const config = getRetentionConfig();
  if (!config.enabled) {
    return { skipped: true, reason: 'RETENTION_ENABLED=false' };
  }

  const result = {
    skipped: false,
    auditLogsDeleted: 0,
    systemLogsDeleted: 0,
    messagesAnonymized: 0
  };

  if (config.auditLogDays > 0) {
    const deleted = await prisma.auditLog.deleteMany({
      where: { timestamp: { lt: cutoffDate(config.auditLogDays) } }
    });
    result.auditLogsDeleted = deleted.count;
  }

  if (config.systemLogDays > 0) {
    const deleted = await prisma.log.deleteMany({
      where: { timestamp: { lt: cutoffDate(config.systemLogDays) } }
    });
    result.systemLogsDeleted = deleted.count;
  }

  if (config.messageDays > 0) {
    const anonymized = await prisma.message.updateMany({
      where: {
        timestamp: { lt: cutoffDate(config.messageDays) },
        is_note: false
      },
      data: {
        text: '[mensagem expirada por politica de retencao]',
        media_url: null,
        media_type: null,
        file_name: null,
        payment_url: null
      }
    });
    result.messagesAnonymized = anonymized.count;
  }

  return result;
}

module.exports = {
  applyRetentionPolicy,
  getRetentionConfig
};
