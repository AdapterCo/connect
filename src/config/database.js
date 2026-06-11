const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { encrypt } = require('../utils/crypto');

const prisma = new PrismaClient();

async function initializeDatabase() {
  try {
    const companyCount = await prisma.company.count();
    if (companyCount === 0) {
      await prisma.company.create({
        data: {
          id: 'comp_default',
          name: 'Adapter Connect',
          slug: 'adapter-connect',
          plan: 'free',
          max_instances: 1,
          max_users: 2,
          mp_enabled: false
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
          grok_model: 'grok-4.3',
          system_prompt: 'Você é um assistente virtual de atendimento. Seja cordial e ajude o cliente.'
        }
      });

      const salt = bcrypt.genSaltSync(10);
      const hashedPassword = bcrypt.hashSync('admin123', salt);
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
