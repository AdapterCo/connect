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
      user_id: instance.user_id || null,
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

  const data = {
    status,
    phone
  };

  if (phone && !existing.user_id) {
    const rawDigits = phone.replace(/\D/g, '');
    const candidates = [rawDigits, rawDigits.startsWith('55') ? rawDigits.slice(2) : '55' + rawDigits];
    const matchingUser = await prisma.user.findFirst({
      where: {
        company_id: companyId,
        phone: { in: candidates }
      },
      select: { id: true }
    });
    if (matchingUser) {
      data.user_id = matchingUser.id;
    }
  }

  return prisma.instance.update({
    where: { id },
    data
  });
}

async function updateUser(id, userId, companyId) {
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

  const rawPhone = user.phone ? user.phone.replace(/\D/g, '') : null;
  const phoneCandidates = rawPhone ? [
    rawPhone,
    rawPhone.startsWith('55') ? rawPhone.slice(2) : '55' + rawPhone
  ] : [];

  const instances = await prisma.instance.findMany({
    where: {
      company_id: companyId,
      OR: [
        { user_id: user.id },
        ...(phoneCandidates.length > 0 ? [{ phone: { in: phoneCandidates } }] : [])
      ]
    },
    select: { id: true, user_id: true }
  });

  const unlinked = instances.filter(i => !i.user_id);
  if (unlinked.length > 0) {
    await prisma.instance.updateMany({
      where: { id: { in: unlinked.map(i => i.id) }, company_id: companyId },
      data: { user_id: user.id }
    }).catch(() => {});
  }

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
