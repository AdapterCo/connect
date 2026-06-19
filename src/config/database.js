const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { encrypt } = require('../utils/crypto');

const prisma = new PrismaClient();

async function initializeDatabase() {
  try {
    const essentialPlan = await prisma.plan.upsert({
      where: { name: 'Essencial' },
      update: {
        max_instances: 1,
        max_users: 2,
        max_products: 30,
        price: 1,
        is_active: true
      },
      create: {
        name: 'Essencial',
        max_instances: 1,
        max_users: 2,
        max_products: 30,
        price: 1,
        is_active: true
      }
    });

    await prisma.plan.upsert({
      where: { name: 'Profissional' },
      update: {
        max_instances: 3,
        max_users: 10,
        max_products: 50,
        price: 1.5,
        is_active: true
      },
      create: {
        name: 'Profissional',
        max_instances: 3,
        max_users: 10,
        max_products: 50,
        price: 1.5,
        is_active: true
      }
    });

    await prisma.plan.upsert({
      where: { name: 'Empresarial' },
      update: {
        max_instances: 10,
        max_users: 50,
        max_products: 100,
        price: 2,
        is_active: true
      },
      create: {
        name: 'Empresarial',
        max_instances: 10,
        max_users: 50,
        max_products: 100,
        price: 2,
        is_active: true
      }
    });

    await prisma.plan.updateMany({
      where: { name: { in: ['Free', 'Pro', 'Enterprise'] } },
      data: { is_active: false }
    });

    const companyCount = await prisma.company.count();
    if (companyCount === 0) {
      await prisma.company.create({
        data: {
          id: 'comp_default',
          name: 'Adapter Connect',
          slug: 'adapter-connect',
          plan: essentialPlan.name,
          plan_id: essentialPlan.id,
          max_instances: essentialPlan.max_instances,
          max_users: essentialPlan.max_users,
          max_products: essentialPlan.max_products,
          mp_enabled: false,
          is_active: true
        }
      });

      await prisma.settings.create({
        data: {
          company_id: 'comp_default',
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

      const hashedPassword = await bcrypt.hash('admin123', 10);
      await prisma.user.create({
        data: {
          id: 'usr_admin',
          name: 'Administrador',
          username: 'admin',
          password: hashedPassword,
          role: 'admin',
          status: 'online',
          company_id: 'comp_default'
        }
      });

      const superadminPassword = await bcrypt.hash('superadmin123', 10);
      await prisma.user.create({
        data: {
          id: 'usr_superadmin',
          name: 'Super Admin',
          username: 'superadmin',
          password: superadminPassword,
          role: 'superadmin',
          status: 'online',
          company_id: 'comp_default'
        }
      });

      await prisma.instance.create({
        data: {
          id: 'inst_default',
          name: 'Número Principal',
          status: 'disconnected',
          company_id: 'comp_default'
        }
      });
    }
  } catch (error) {
    console.error('Error seeding DB:', error);
  }
}

module.exports = {
  prisma,
  initializeDatabase
};
