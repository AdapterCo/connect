const bcrypt = require('bcryptjs');
const { generateToken } = require('../config/auth');
const User = require('../models/User');
const Log = require('../models/Log');
const { emitToCompany } = require('../config/socket');
const { prisma } = require('../config/database');

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
    const { companyName, companySlug, adminName, adminUsername, adminPassword, planId, payerEmail } = req.body;
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

    const staleCheckoutDate = new Date();
    staleCheckoutDate.setDate(staleCheckoutDate.getDate() - 2);
    await prisma.signupCheckout.deleteMany({
      where: {
        company_id: null,
        status: { in: ['pending', 'failed'] },
        created_at: { lt: staleCheckoutDate }
      }
    });

    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(adminPassword, salt);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 1);

    const existingCheckout = await prisma.signupCheckout.findFirst({
      where: {
        company_id: null,
        status: { in: ['pending', 'failed'] },
        OR: [
          { company_slug: companySlug },
          { admin_username: adminUsername }
        ]
      },
      orderBy: { created_at: 'desc' }
    });

    const checkoutData = {
      company_name: companyName,
      company_slug: companySlug,
      admin_name: adminName,
      admin_username: adminUsername,
      admin_password: hashedPassword,
      payer_email: String(payerEmail || `${adminUsername}@${companySlug}.com.br`).trim().toLowerCase(),
      plan_id: plan.id,
      amount: plan.price,
      due_date: dueDate,
      status: 'pending',
      mp_payment_id: null,
      mp_payment_url: null,
      paid_at: null
    };

    const checkout = existingCheckout
      ? await prisma.signupCheckout.update({
        where: { id: existingCheckout.id },
        data: checkoutData
      })
      : await prisma.signupCheckout.create({
        data: checkoutData
      });

    res.status(201).json({
      success: true,
      company: { name: companyName, slug: companySlug },
      invoice: {
        id: checkout.id,
        amount: checkout.amount,
        status: checkout.status,
        company: { name: companyName, slug: companySlug },
        plan
      },
      payment_url: null,
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
