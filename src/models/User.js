const { prisma } = require('../config/database');

// Cadastro arquivado ao remover alguem com historico de vendas.
const REMOVED_ROLE = 'removed';

async function findAll(companyId) {
  return prisma.user.findMany({
    where: { company_id: companyId, role: { not: REMOVED_ROLE } }
  });
}

async function findById(id, companyId) {
  const where = { id };
  if (companyId) {
    where.company_id = companyId;
  }
  return prisma.user.findFirst({
    where
  });
}

async function findByUsername(username) {
  if (!username) return null;
  return prisma.user.findFirst({
    where: {
      username: {
        equals: username,
        mode: 'insensitive'
      }
    }
  });
}

async function create(user, companyId) {
  return require('../services/salesRotationService').withCompanyLock(companyId, async tx => {
  const company = await tx.company.findUnique({ where: { id: companyId } });
  if (!company || await tx.user.count({ where: { company_id: companyId, role: { not: REMOVED_ROLE } } }) >= company.max_users) throw Object.assign(new Error('Limite de usuarios atingido.'), { status: 403 });
  return tx.user.create({
    data: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email || null,
      phone: user.phone || null,
      password: user.password,
      role: user.role,
      sector: user.sector || null,
      status: user.status || 'online',
      company_id: companyId
    }
  });
  });
}

async function remove(id, companyId) {
  await prisma.user.deleteMany({
    where: {
      id: id,
      company_id: companyId
    }
  });
  return true;
}

module.exports = {
  REMOVED_ROLE,
  findAll,
  findById,
  findByUsername,
  create,
  remove
};
