const { prisma } = require('../config/database');

async function add(message, companyId = 'comp_default') {
  const logEntry = await prisma.log.create({
    data: {
      message,
      company_id: companyId,
      timestamp: new Date()
    }
  });

  const count = await prisma.log.count({
    where: { company_id: companyId }
  });

  if (count > 100) {
    const oldLogs = await prisma.log.findMany({
      where: { company_id: companyId },
      orderBy: { timestamp: 'desc' },
      skip: 100
    });
    if (oldLogs.length > 0) {
      const idsToDelete = oldLogs.map(l => l.id);
      await prisma.log.deleteMany({
        where: { id: { in: idsToDelete } }
      });
    }
  }

  return {
    timestamp: logEntry.timestamp.toISOString(),
    message: logEntry.message,
    company_id: logEntry.company_id
  };
}

async function findAll(companyId) {
  const logs = await prisma.log.findMany({
    where: { company_id: companyId },
    orderBy: { timestamp: 'desc' }
  });
  return logs.map(l => ({
    timestamp: l.timestamp.toISOString(),
    message: l.message,
    company_id: l.company_id
  }));
}

async function clear(companyId) {
  await prisma.log.deleteMany({
    where: { company_id: companyId }
  });
  return true;
}

module.exports = {
  add,
  findAll,
  clear
};
