const { prisma } = require('../config/database');

async function findAll(companyId) {
  return prisma.user.findMany({
    where: { company_id: companyId }
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
  return prisma.user.create({
    data: {
      id: user.id,
      name: user.name,
      username: user.username,
      password: user.password,
      role: user.role,
      status: user.status || 'offline',
      company_id: companyId
    }
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
  findAll,
  findById,
  findByUsername,
  create,
  remove
};
