const { prisma } = require('../config/database');

async function findAll() {
  return prisma.company.findMany();
}

async function findById(id) {
  return prisma.company.findUnique({
    where: { id }
  });
}

async function create(company) {
  return prisma.company.create({
    data: {
      id: company.id,
      name: company.name,
      slug: company.slug || company.id,
      plan: company.plan || 'free',
      max_instances: company.max_instances || 1,
      max_users: company.max_users || 2,
      mp_access_token: company.mp_access_token || null,
      mp_public_key: company.mp_public_key || null,
      mp_enabled: company.mp_enabled || false,
      mp_webhook_url: company.mp_webhook_url || null
    }
  });
}

module.exports = {
  findAll,
  findById,
  create
};
