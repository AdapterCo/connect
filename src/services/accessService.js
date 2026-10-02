const { prisma } = require('../config/database');
const isManager = user => ['admin', 'supervisor', 'superadmin'].includes(user?.role);
const sectorOf = user => user.sector || ({ seller: 'sales', support: 'support', other: 'finance' }[user.role] || null);
const companyActive = (company, now = new Date()) => !!company?.is_active && (!company.expires_at || new Date(company.expires_at) > now);
async function chatScope(user) {
  if (!user?.id || !user.company_id) throw new Error('Usuario sem empresa.');
  const where = { company_id: user.company_id };
  if (isManager(user)) return where;
  const ids = await require('../models/Instance').getUserInstanceIds(user, user.company_id);
  if (user.role === 'seller') where.instance_id = { in: ids };
  else where.OR = [{ assigned_to: user.id }, ...(ids.length ? [{ instance_id: { in: ids } }] : [])];
  const sector = sectorOf(user);
  if (sector) where.AND = [{ OR: [{ sector }, { sector: null }] }];
  return where;
}
function canSeeChat(user, chat, instanceIds = []) {
  if (chat.company_id && chat.company_id !== user.company_id) return false;
  if (isManager(user)) return true;
  const sector = sectorOf(user);
  return (!sector || !chat.sector || sector === chat.sector) &&
    (user.role === 'seller' ? instanceIds.includes(chat.instance_id) : chat.assigned_to === user.id || instanceIds.includes(chat.instance_id));
}
async function assertCompanyActive(companyId) {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!companyActive(company)) throw Object.assign(new Error('Empresa inativa ou assinatura expirada.'), { status: 403 });
  return company;
}
module.exports = { isManager, sectorOf, chatScope, canSeeChat, companyActive, assertCompanyActive };
