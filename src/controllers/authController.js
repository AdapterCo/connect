const bcrypt = require('bcryptjs');
const { generateToken } = require('../config/auth');
const User = require('../models/User');
const Log = require('../models/Log');
const { emitToCompany } = require('../config/socket');
const { prisma } = require('../config/database');
const { encrypt } = require('../utils/crypto');
const billingService = require('../services/billingService');

async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    }

    const user = await User.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }

    const company = await prisma.company.findUnique({
      where: { id: user.company_id },
      include: {
        invoices: {
          where: { status: 'pending' },
          orderBy: { created_at: 'desc' },
          take: 1
        }
      }
    });

    if (!company) {
      return res.status(403).json({ error: 'Empresa não encontrada.' });
    }

    const isExpired = company.expires_at && new Date(company.expires_at) < new Date();
    if (!company.is_active || isExpired) {
      const pendingInvoice = company.invoices[0] || null;
      return res.status(402).json({
        error: pendingInvoice?.mp_payment_url
          ? 'Sua conta ainda não foi ativada. Conclua o pagamento para acessar o painel.'
          : 'Sua conta ainda não foi ativada e não há link de pagamento disponível. Entre em contato com o suporte.',
        requires_payment: true,
        payment_url: pendingInvoice?.mp_payment_url || null,
        invoice: pendingInvoice
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'online' }
    });

    const updatedUsers = await User.findAll(user.company_id);
    emitToCompany(user.company_id, 'users_updated', updatedUsers);

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      company_id: user.company_id
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        status: 'online',
        company_id: user.company_id
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao efetuar login.' });
  }
}

async function logout(req, res) {
  try {
    const userId = req.user.id;
    const companyId = req.user.company_id;

    await prisma.user.updateMany({
      where: { id: userId },
      data: { status: 'offline' }
    });

    const updatedUsers = await User.findAll(companyId);
    emitToCompany(companyId, 'users_updated', updatedUsers);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao efetuar logout.' });
  }
}

async function updateStatus(req, res) {
  try {
    const { status } = req.body;
    if (!['online', 'offline'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const userId = req.user.id;
    const companyId = req.user.company_id;

    await prisma.user.updateMany({
      where: { id: userId },
      data: { status }
    });

    const updatedUsers = await User.findAll(companyId);
    emitToCompany(companyId, 'users_updated', updatedUsers);

    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar status.' });
  }
}

async function register(req, res) {
  try {
    const isAdminOrSupervisor = req.user.role === 'admin' || req.user.role === 'supervisor';
    if (!isAdminOrSupervisor) {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores ou supervisores podem cadastrar atendentes.' });
    }

    const { name, username, password, role } = req.body;
    if (!name || !username || !password || !role) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    if (!['admin', 'supervisor', 'seller', 'support', 'other'].includes(role)) {
      return res.status(400).json({ error: 'Função inválida.' });
    }

    if (req.user.role === 'supervisor' && ['admin', 'supervisor'].includes(role)) {
      return res.status(403).json({ error: 'Acesso negado. Supervisores só podem cadastrar Vendedores, Suporte ou Outro.' });
    }

    const existing = await User.findByUsername(username);
    if (existing) {
      return res.status(400).json({ error: 'Este nome de usuário já está em uso.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    const newUser = {
      id: 'usr_' + Date.now(),
      name,
      username,
      password: hashedPassword,
      role,
      status: 'offline',
      company_id: req.user.company_id
    };

    await User.create(newUser, req.user.company_id);
    await Log.add(`Novo atendente cadastrado: ${name} (${role}) pelo administrador/supervisor ${req.user.name}.`, req.user.company_id);

    const updatedUsers = await User.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'users_updated', updatedUsers);

    res.json({ success: true, user: { id: newUser.id, name, username, role, company_id: newUser.company_id } });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao cadastrar atendente.' });
  }
}

async function registerTenant(req, res) {
  try {
    const { companyName, companySlug, adminName, adminUsername, adminPassword, planId } = req.body;
    if (!companyName || !companySlug || !adminName || !adminUsername || !adminPassword || !planId) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    const plan = await prisma.plan.findUnique({
      where: { id: planId }
    });

    if (!plan || !plan.is_active || plan.price <= 0) {
      return res.status(400).json({ error: 'Plano invÃ¡lido ou indisponÃ­vel.' });
    }

    const existingCompany = await prisma.company.findUnique({
      where: { slug: companySlug }
    });
    if (existingCompany) {
      return res.status(400).json({ error: 'Este slug de empresa já está em uso.' });
    }

    const existingUser = await User.findByUsername(adminUsername);
    if (existingUser) {
      return res.status(400).json({ error: 'Este nome de usuário já está em uso.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(adminPassword, salt);

    const suffix = Math.random().toString(36).substring(2, 6);
    const companyId = 'comp_' + Date.now() + '_' + suffix;
    const userId = 'usr_' + Date.now() + '_' + suffix;
    const instanceId = 'inst_' + Date.now() + '_' + suffix;

    await prisma.$transaction(async (tx) => {
      await tx.company.create({
        data: {
          id: companyId,
          name: companyName,
          slug: companySlug,
          plan: plan.name,
          plan_id: plan.id,
          max_instances: plan.max_instances,
          max_users: plan.max_users,
          max_products: plan.max_products,
          mp_enabled: false,
          is_active: false
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
          name: adminName,
          username: adminUsername,
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
    });

    await Log.add(`Empresa ${companyName} registrada com sucesso. Administrador: ${adminName}.`, companyId);

    let billing;
    try {
      billing = await billingService.createSubscription(companyId, planId);
    } catch (billingError) {
      await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
      return res.status(500).json({
        error: billingError.message || 'Erro ao gerar pagamento da assinatura.'
      });
    }

    res.status(201).json({
      success: true,
      company: { id: companyId, name: companyName, slug: companySlug },
      user: { id: userId, name: adminName, username: adminUsername, role: 'admin' },
      invoice: billing.invoice,
      payment_url: billing.mp_payment_url,
      requires_payment: true
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao registrar empresa.' });
  }
}

module.exports = {
  login,
  logout,
  updateStatus,
  register,
  registerTenant
};
