const { prisma } = require('../config/database');

async function getPlanInfo(req, res) {
  try {
    const companyId = req.user.company_id;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        plan_relation: true,
        _count: {
          select: {
            users: true,
            instances: true,
            chats: true
          }
        }
      }
    });

    if (!company) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }

    const isExpired = company.expires_at && new Date(company.expires_at) < new Date();

    res.json({
      plan: {
        name: company.plan_relation?.name || company.plan,
        max_instances: company.max_instances,
        max_users: company.max_users,
        price: company.plan_relation?.price || 0
      },
      usage: {
        users: company._count.users,
        instances: company._count.instances,
        chats: company._count.chats
      },
      is_active: company.is_active && !isExpired,
      expires_at: company.expires_at
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar informações do plano.' });
  }
}

module.exports = { getPlanInfo };
