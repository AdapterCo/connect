const { prisma } = require('../config/database');

async function log({ company_id, user_id, user_name, action, entity, entity_id, details, ip, user_agent }) {
  try {
    await prisma.auditLog.create({
      data: {
        company_id,
        user_id: user_id || null,
        user_name: user_name || null,
        action,
        entity,
        entity_id: entity_id || null,
        details: details || null,
        ip: ip || null,
        user_agent: user_agent || null
      }
    });
  } catch (error) {
    console.error('Erro ao registrar log de auditoria:', error);
  }
}

async function getLogs(companyId, filters = {}) {
  const where = { company_id: companyId };

  if (filters.action) {
    where.action = filters.action;
  }

  if (filters.entity) {
    where.entity = filters.entity;
  }

  if (filters.user_id) {
    where.user_id = filters.user_id;
  }

  if (filters.from || filters.to) {
    where.timestamp = {};
    if (filters.from) {
      where.timestamp.gte = new Date(filters.from);
    }
    if (filters.to) {
      where.timestamp.lte = new Date(filters.to);
    }
  }

  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 50;
  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip,
      take: limit
    }),
    prisma.auditLog.count({ where })
  ]);

  return {
    logs: logs.map(l => ({
      ...l,
      timestamp: l.timestamp.toISOString()
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

async function getLogStats(companyId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [byAction, byEntity, total] = await Promise.all([
    prisma.auditLog.groupBy({
      by: ['action'],
      where: {
        company_id: companyId,
        timestamp: { gte: thirtyDaysAgo }
      },
      _count: { id: true }
    }),
    prisma.auditLog.groupBy({
      by: ['entity'],
      where: {
        company_id: companyId,
        timestamp: { gte: thirtyDaysAgo }
      },
      _count: { id: true }
    }),
    prisma.auditLog.count({
      where: {
        company_id: companyId,
        timestamp: { gte: thirtyDaysAgo }
      }
    })
  ]);

  return {
    total,
    byAction: byAction.map(a => ({ action: a.action, count: a._count.id })),
    byEntity: byEntity.map(e => ({ entity: e.entity, count: e._count.id }))
  };
}

module.exports = {
  log,
  getLogs,
  getLogStats
};
