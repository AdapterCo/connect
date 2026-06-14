const { prisma } = require('../config/database');
const bcrypt = require('bcryptjs');
const { encrypt } = require('../utils/crypto');

async function listCompanies(req, res) {
  try {
    const companies = await prisma.company.findMany({
      include: {
        plan_relation: true,
        _count: {
          select: {
            users: true,
            instances: true,
            chats: true,
            products: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });
    res.json(companies);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar empresas.' });
  }
}

async function getCompany(req, res) {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        plan_relation: true,
        users: { select: { id: true, name: true, username: true, role: true, status: true } },
        instances: true,
        _count: { select: { chats: true } }
      }
    });
    if (!company) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }
    res.json(company);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar empresa.' });
  }
}

async function createCompany(req, res) {
  try {
    const { name, slug, plan_id, admin_name, admin_username, admin_password } = req.body;
    
    if (!name || !slug || !plan_id || !admin_name || !admin_username || !admin_password) {
      return res.status(400).json({ error: 'Campos obrigatórios: name, slug, plan_id, admin_name, admin_username, admin_password' });
    }

    const existingSlug = await prisma.company.findUnique({ where: { slug } });
    if (existingSlug) {
      return res.status(400).json({ error: 'Slug já está em uso.' });
    }

    const existingUser = await prisma.user.findUnique({ where: { username: admin_username } });
    if (existingUser) {
      return res.status(400).json({ error: 'Username já está em uso.' });
    }

    const plan = await prisma.plan.findUnique({ where: { id: plan_id } });
    if (!plan || !plan.is_active || plan.price <= 0) {
      return res.status(400).json({ error: 'Plano inválido ou indisponível.' });
    }
    const maxInstances = plan.max_instances;
    const maxUsers = plan.max_users;
    const maxProducts = plan.max_products;

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(admin_password, salt);

    const suffix = Math.random().toString(36).substring(2, 6);
    const companyId = 'comp_' + Date.now() + '_' + suffix;
    const userId = 'usr_' + Date.now() + '_' + suffix;
    const instanceId = 'inst_' + Date.now() + '_' + suffix;

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          id: companyId,
          name,
          slug,
          plan: plan.name,
          plan_id: plan.id,
          max_instances: maxInstances,
          max_users: maxUsers,
          max_products: maxProducts,
          is_active: true
        }
      });

      await tx.settings.create({
        data: {
          company_id: companyId,
          ai_enabled: false,
          ai_provider: 'mock',
          gemini_key: encrypt(''),
          openai_key: encrypt(''),
          grok_key: encrypt(''),
          gemini_model: 'gemini-2.5-flash',
          openai_model: 'gpt-4o-mini',
          grok_model: 'grok-4.3',
          system_prompt: 'Você é um assistente virtual de atendimento. Seja cordial e ajude o cliente.'
        }
      });

      await tx.user.create({
        data: {
          id: userId,
          name: admin_name,
          username: admin_username,
          password: hashedPassword,
          role: 'admin',
          status: 'offline',
          company_id: companyId
        }
      });

      await tx.instance.create({
        data: {
          id: instanceId,
          name: 'Número Principal',
          status: 'disconnected',
          company_id: companyId
        }
      });

      return company;
    });

    res.status(201).json({ success: true, company: result });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar empresa: ' + error.message });
  }
}

async function updateCompany(req, res) {
  try {
    const { name, plan_id, max_instances, max_users, max_products, is_active, expires_at } = req.body;
    
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }

    const plan = plan_id ? await prisma.plan.findUnique({ where: { id: plan_id } }) : null;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (plan_id !== undefined) {
      updateData.plan_id = plan_id;
      updateData.plan = plan?.name || company.plan;
      if (plan) {
        updateData.max_instances = plan.max_instances;
        updateData.max_users = plan.max_users;
        updateData.max_products = plan.max_products;
      }
    }
    if (max_instances !== undefined && !plan_id) updateData.max_instances = max_instances;
    if (max_users !== undefined && !plan_id) updateData.max_users = max_users;
    if (max_products !== undefined && !plan_id) updateData.max_products = max_products;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (expires_at !== undefined) updateData.expires_at = expires_at ? new Date(expires_at) : null;

    const updated = await prisma.company.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({ success: true, company: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar empresa.' });
  }
}

async function deleteCompany(req, res) {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }

    await prisma.company.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir empresa.' });
  }
}

async function listPlans(req, res) {
  try {
    const plans = await prisma.plan.findMany({
      orderBy: { price: 'asc' }
    });
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar planos.' });
  }
}

async function createPlan(req, res) {
  try {
    const { name, max_instances, max_users, max_products, price } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Nome do plano é obrigatório.' });
    }

    if (!price || Number(price) <= 0) {
      return res.status(400).json({ error: 'Valor do plano deve ser maior que zero.' });
    }

    const existing = await prisma.plan.findUnique({ where: { name } });
    if (existing) {
      return res.status(400).json({ error: 'Plano com este nome já existe.' });
    }

    const plan = await prisma.plan.create({
      data: {
        name,
        max_instances: max_instances || 1,
        max_users: max_users || 2,
        max_products: max_products || 30,
        price
      }
    });

    res.status(201).json({ success: true, plan });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar plano.' });
  }
}

async function updatePlan(req, res) {
  try {
    const { name, max_instances, max_users, max_products, price, is_active } = req.body;
    
    const plan = await prisma.plan.findUnique({ where: { id: req.params.id } });
    if (!plan) {
      return res.status(404).json({ error: 'Plano não encontrado.' });
    }

    if (price !== undefined && Number(price) <= 0) {
      return res.status(400).json({ error: 'Valor do plano deve ser maior que zero.' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (max_instances !== undefined) updateData.max_instances = max_instances;
    if (max_users !== undefined) updateData.max_users = max_users;
    if (max_products !== undefined) updateData.max_products = max_products;
    if (price !== undefined) updateData.price = price;
    if (is_active !== undefined) updateData.is_active = is_active;

    const updated = await prisma.plan.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({ success: true, plan: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar plano.' });
  }
}

async function deletePlan(req, res) {
  try {
    const plan = await prisma.plan.findUnique({ 
      where: { id: req.params.id },
      include: { _count: { select: { companies: true } } }
    });
    
    if (!plan) {
      return res.status(404).json({ error: 'Plano não encontrado.' });
    }

    if (plan._count.companies > 0) {
      return res.status(400).json({ error: 'Não é possível excluir plano com empresas vinculadas.' });
    }

    await prisma.plan.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir plano.' });
  }
}

module.exports = {
  listCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan
};
