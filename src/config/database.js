const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { encrypt } = require('../utils/crypto');
const { passwordError } = require('../middleware/validationMiddleware');

const prisma = new PrismaClient();

const PLATFORM_COMPANY_ID = 'comp_default';

// Planos criados apenas quando ainda nao existem. Nascem inativos: preco e
// limites sao definidos pelo superadmin e nunca sobrescritos na inicializacao.
// Excecao: um plano ainda virgem (preco 0, inativo) pode ser ativado direto
// pela variavel de ambiente PLAN_<NOME>_PRICE, permitindo self-service desde o
// primeiro boot sem nenhum login de administrador.
const DEFAULT_PLANS = [
  { name: 'Essencial', max_instances: 1, max_users: 2, max_products: 30 },
  { name: 'Profissional', max_instances: 3, max_users: 10, max_products: 50 },
  { name: 'Empresarial', max_instances: 10, max_users: 50, max_products: 100 }
];

// Senhas que versoes anteriores gravavam no seed. Usadas apenas para detectar
// e bloquear contas que ainda as utilizam.
const LEGACY_DEFAULT_PASSWORDS = {
  usr_admin: 'admin123',
  usr_superadmin: 'superadmin123'
};


function planPriceFromEnv(name) {
  const raw = process.env[`PLAN_${name.toUpperCase()}_PRICE`];
  if (raw === undefined || raw === '') return null;
  const price = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(price) || price <= 0) {
    console.error(`[Seed] PLAN_${name.toUpperCase()}_PRICE ignorada: valor deve ser um numero maior que zero.`);
    return null;
  }
  return price;
}

async function ensurePlans() {
  for (const plan of DEFAULT_PLANS) {
    const envPrice = planPriceFromEnv(plan.name);
    const existing = await prisma.plan.findUnique({ where: { name: plan.name } });

    if (!existing) {
      await prisma.plan.create({
        data: envPrice === null ? { ...plan, price: 0, is_active: false } : { ...plan, price: envPrice, is_active: true }
      });
      continue;
    }

    // Plano ja configurado (painel ou env em boot anterior) nunca e sobrescrito.
    // Um plano ainda virgem (preco 0 e inativo) pode ser ativado pelo env.
    const virgin = existing.price === 0 && existing.is_active === false;
    if (envPrice !== null && virgin) {
      await prisma.plan.update({
        where: { name: plan.name },
        data: { price: envPrice, is_active: true }
      });
    }
  }
}

async function ensurePlatformCompany() {
  const existing = await prisma.company.findUnique({ where: { id: PLATFORM_COMPANY_ID } });
  if (existing) return existing;

  const plan = await prisma.plan.findUnique({ where: { name: DEFAULT_PLANS[0].name } });
  const company = await prisma.company.create({
    data: {
      id: PLATFORM_COMPANY_ID,
      name: 'Adapter Connect',
      slug: 'adapter-connect',
      plan: plan.name,
      plan_id: plan.id,
      max_instances: plan.max_instances,
      max_users: plan.max_users,
      max_products: plan.max_products,
      mp_enabled: false,
      is_active: true
    }
  });

  await prisma.settings.create({
    data: {
      company_id: PLATFORM_COMPANY_ID,
      ai_enabled: false,
      ai_provider: 'mock',
      gemini_key: encrypt(''),
      openai_key: encrypt(''),
      grok_key: encrypt(''),
      gemini_model: 'gemini-2.5-flash',
      openai_model: 'gpt-4o-mini',
      grok_model: 'llama-3.3-70b-versatile',
      system_prompt: 'Você é um assistente virtual de atendimento. Seja cordial e ajude o cliente.'
    }
  });

  return company;
}

function superadminPasswordFromEnv() {
  const password = process.env.SUPERADMIN_PASSWORD || '';
  if (!password) return null;
  const invalid = passwordError(password, 'SUPERADMIN_PASSWORD');
  if (invalid) {
    console.error(`[Seed] SUPERADMIN_PASSWORD ignorada: ${invalid}`);
    return null;
  }
  return password;
}

// Contas que ainda usam a senha padrao antiga recebem uma senha aleatoria
// descartada e tem as sessoes revogadas.
async function lockLegacyDefaultAccounts() {
  const users = await prisma.user.findMany({
    where: { id: { in: Object.keys(LEGACY_DEFAULT_PASSWORDS) } },
    select: { id: true, username: true, password: true }
  });

  for (const user of users) {
    if (!await bcrypt.compare(LEGACY_DEFAULT_PASSWORDS[user.id], user.password)) continue;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
        session_version: { increment: 1 },
        status: 'offline'
      }
    });
    console.warn(`[Seed] Conta '${user.username}' usava a senha padrao antiga e foi bloqueada.`);
  }
}

// O superadmin e criado somente a partir de SUPERADMIN_PASSWORD. Uma conta
// ainda com a senha padrao antiga tambem recebe essa senha.
async function ensureSuperadmin() {
  const password = superadminPasswordFromEnv();
  const existing = await prisma.user.findFirst({ where: { role: 'superadmin' } });

  if (existing) {
    const legacy = LEGACY_DEFAULT_PASSWORDS[existing.id];
    if (password && legacy && await bcrypt.compare(legacy, existing.password)) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { password: await bcrypt.hash(password, 10), session_version: { increment: 1 } }
      });
      console.warn('[Seed] Senha padrao do superadmin substituida por SUPERADMIN_PASSWORD.');
    }
    return;
  }

  if (!password) {
    console.warn('[Seed] Nenhum superadmin cadastrado. Defina SUPERADMIN_PASSWORD para cria-lo na inicializacao.');
    return;
  }

  const username = String(process.env.SUPERADMIN_USERNAME || 'superadmin').trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { username } })) {
    console.error(`[Seed] Usuario '${username}' ja existe; superadmin nao criado.`);
    return;
  }

  await prisma.user.create({
    data: {
      id: 'usr_superadmin',
      name: 'Super Admin',
      username,
      password: await bcrypt.hash(password, 10),
      role: 'superadmin',
      status: 'offline',
      company_id: PLATFORM_COMPANY_ID
    }
  });
  console.log(`[Seed] Superadmin '${username}' criado.`);
}

async function initializeDatabase() {
  try {
    await ensurePlans();
    await ensurePlatformCompany();
    await ensureSuperadmin();
    await lockLegacyDefaultAccounts();
  } catch (error) {
    console.error('Error seeding DB:', error);
  }
}

module.exports = {
  prisma,
  initializeDatabase
};
