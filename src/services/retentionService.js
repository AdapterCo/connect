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
    const expired = await prisma.message.findMany({ where: { timestamp: { lt: cutoffDate(config.messageDays) }, text: { not: '[mensagem expirada por politica de retencao]' } }, take: 1000, select: { id: true, media_url: true } });
    const anonymized = await prisma.$transaction(async tx => {
    await require('./mediaCleanupService').enqueue(tx, expired.map(m => m.media_url));
    return tx.message.updateMany({
      where: {
        timestamp: { lt: cutoffDate(config.messageDays) },
        id: { in: expired.map(m => m.id) }
      },
      data: {
        sender_id: null,
        text: '[mensagem expirada por politica de retencao]',
        media_url: null,
        media_type: null,
        file_name: null,
        payment_url: null
      }
    });
    });
    result.messagesAnonymized = anonymized.count;
    await prisma.flowSession.updateMany({ where: { updated_at: { lt: cutoffDate(config.messageDays) } }, data: { variables: {}, current_node_id: null, status: 'expired' } });
  }

  return result;
}

module.exports = {
  applyRetentionPolicy,
  getRetentionConfig
};
