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

async function validateUser(userId, companyId) {
  if (userId && !await prisma.user.findFirst({ where: { id: userId, company_id: companyId }, select: { id: true } })) {
    throw Object.assign(new Error('Atendente nao pertence a empresa.'), { status: 400 });
  }
}
async function create(instance, companyId) {
  await validateUser(instance.user_id, companyId);
  return require('../services/salesRotationService').withCompanyLock(companyId, async tx => {
  const company = await tx.company.findUnique({ where: { id: companyId } });
  if (!company || await tx.instance.count({ where: { company_id: companyId } }) >= company.max_instances) throw Object.assign(new Error('Limite de instancias atingido.'), { status: 403 });
  return tx.instance.create({
    data: {
      id: instance.id,
      name: instance.name,
      phone: instance.phone || null,
      status: instance.status || 'disconnected',
      user_id: instance.user_id || null,
      company_id: companyId
    }
  });
  });
}

async function remove(id, companyId) {
  const result = await prisma.instance.deleteMany({ where: { id, company_id: companyId } });
  return result.count > 0;
}

async function updateStatus(id, status, phone, companyId) {
  const existing = await prisma.instance.findFirst({
    where: { id, company_id: companyId }
  });
  if (!existing) return null;

  const data = {
    status,
    phone
  };

  return prisma.instance.update({
    where: { id },
    data
  });
}

async function updateUser(id, userId, companyId) {
  await validateUser(userId, companyId);
  const existing = await prisma.instance.findFirst({
    where: { id, company_id: companyId }
  });
  if (!existing) return null;

  return prisma.instance.update({
    where: { id },
    data: {
      user_id: userId || null
    }
  });
}

async function getUserInstanceIds(user, companyId) {
  if (!user || !prisma.instance) return [];
  if (['admin', 'supervisor', 'superadmin'].includes(user.role)) return [];

  const instances = await prisma.instance.findMany({
    where: { company_id: companyId, user_id: user.id }, select: { id: true }
  });
  return instances.map(i => i.id);
}

module.exports = {
  findAll,
  findById,
  create,
  remove,
  updateStatus,
  updateUser,
  getUserInstanceIds
};
