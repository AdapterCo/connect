const { prisma } = require('../config/database');

async function findAll(companyId) {
  return prisma.instance.findMany({
    where: { company_id: companyId }
  });
}

async function findById(id, companyId) {
  return prisma.instance.findFirst({
    where: { id, company_id: companyId }
  });
}

async function create(instance, companyId) {
  return prisma.instance.create({
    data: {
      id: instance.id,
      name: instance.name,
      phone: instance.phone || null,
      status: instance.status || 'disconnected',
      company_id: companyId
    }
  });
}

async function remove(id, companyId) {
  try {
    await prisma.instance.deleteMany({
      where: { id, company_id: companyId }
    });
    return true;
  } catch (err) {
    return false;
  }
}

async function updateStatus(id, status, phone, companyId) {
  const existing = await prisma.instance.findFirst({
    where: { id, company_id: companyId }
  });
  if (!existing) return null;

  return prisma.instance.update({
    where: { id },
    data: {
      status,
      phone
    }
  });
}

module.exports = {
  findAll,
  findById,
  create,
  remove,
  updateStatus
};
