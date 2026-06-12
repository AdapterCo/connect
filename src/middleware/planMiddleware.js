const { prisma } = require('../config/database');

async function checkCompanyActive(req, res, next) {
  try {
    const companyId = req.user?.company_id;
    if (!companyId) return next();

    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });

    if (!company) {
      return res.status(403).json({ error: 'Empresa não encontrada.' });
    }

    if (!company.is_active) {
      return res.status(403).json({ error: 'Sua empresa está desativada. Entre em contato com o suporte.' });
    }

    if (company.expires_at && new Date(company.expires_at) < new Date()) {
      return res.status(403).json({ error: 'Sua assinatura expirou. Renove seu plano para continuar.' });
    }

    req.company = company;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar status da empresa.' });
  }
}

async function checkUserLimit(req, res, next) {
  try {
    const companyId = req.user?.company_id;
    if (!companyId) return next();

    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });

    if (!company) {
      return res.status(403).json({ error: 'Empresa não encontrada.' });
    }

    const userCount = await prisma.user.count({
      where: { company_id: companyId }
    });

    if (userCount >= company.max_users) {
      return res.status(403).json({ 
        error: `Limite de usuários atingido (${company.max_users}). Faça upgrade do seu plano para adicionar mais usuários.` 
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar limite de usuários.' });
  }
}

async function checkInstanceLimit(req, res, next) {
  try {
    const companyId = req.user?.company_id;
    if (!companyId) return next();

    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });

    if (!company) {
      return res.status(403).json({ error: 'Empresa não encontrada.' });
    }

    const instanceCount = await prisma.instance.count({
      where: { company_id: companyId }
    });

    if (instanceCount >= company.max_instances) {
      return res.status(403).json({ 
        error: `Limite de conexões WhatsApp atingido (${company.max_instances}). Faça upgrade do seu plano para adicionar mais conexões.` 
      });
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Erro ao verificar limite de instâncias.' });
  }
}

module.exports = {
  checkCompanyActive,
  checkUserLimit,
  checkInstanceLimit
};
