const bcrypt = require('bcryptjs');
const { generateToken } = require('../config/auth');
const User = require('../models/User');
const Log = require('../models/Log');
const { emitToCompany } = require('../config/socket');
const { prisma } = require('../config/database');
const { SESSION_COOKIE } = require('../middleware/authMiddleware');

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 24 * 60 * 60 * 1000
};

// Hash descartavel para comparar quando o usuario nao existe: o tempo de
// resposta nao revela quais usernames sao validos.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

async function login(req, res) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    }

    const user = await User.findByUsername(username);
    // [A5 - Anti-Enumeration] Mensagem idêntica para usuário inexistente e senha incorreta
    // para não revelar se um username é válido (OWASP A07).
    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
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
      company_id: user.company_id,
      session_version: user.session_version || 0
    });

    // O token so trafega no cookie HttpOnly: scripts da pagina (e um eventual XSS)
    // nao conseguem le-lo. SameSite=Strict impede o envio a partir de outros sites.
    res.cookie(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    res.json({
      success: true,
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

// Limpa o cookie antes da autenticacao: mesmo com a sessao ja expirada o
// navegador deixa de reenviar o token.
function clearSession(req, res, next) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.clearCookie('crm_media', { path: '/uploads' });
  next();
}

async function me(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, username: true, role: true, status: true, company_id: true }
    });
    if (!user) return res.status(401).json({ error: 'Sessao expirada. Faça login novamente.' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar sessao.' });
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

    const { email, phone } = req.body;
    if (email && await prisma.user.findFirst({ where: { email }, select: { id: true } })) {
      return res.status(400).json({ error: 'Este e-mail já está em uso.' });
    }

    let cleanPhone = null;
    if (phone) {
      const { normalizeDigits } = require('../services/leadNotificationService');
      cleanPhone = normalizeDigits(phone);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: 'usr_' + require('crypto').randomUUID(),
      name,
      username,
      email,
      phone: cleanPhone,
      password: hashedPassword,
      role,
      status: 'offline',
      company_id: req.user.company_id
    };

    await User.create(newUser, req.user.company_id);
    await Log.add(`Novo atendente cadastrado: ${name} (${role}) pelo administrador/supervisor ${req.user.name}.`, req.user.company_id);

    const updatedUsers = await User.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'users_updated', updatedUsers);

    res.json({ success: true, user: { id: newUser.id, name, username, email, phone: cleanPhone, role, company_id: newUser.company_id } });
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

    if (payerEmail !== undefined && payerEmail !== '' &&
        (typeof payerEmail !== 'string' || !/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(payerEmail.trim()))) {
      return res.status(400).json({ error: 'E-mail do pagador inválido.' });
    }

    const plan = await prisma.plan.findUnique({
      where: { id: planId }
    });

    if (!plan || !plan.is_active || plan.price <= 0) {
      return res.status(400).json({ error: 'Plano inválido ou indisponível.' });
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

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

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
  clearSession,
  me,
  updateStatus,
  register,
  registerTenant
};
