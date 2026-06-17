const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`FATAL: ${name} nao definido. Configure a variavel de ambiente ${name}.`);
  }
  return value;
}

const JWT_SECRET = requireEnv('JWT_SECRET');
const ENCRYPTION_KEY = requireEnv('ENCRYPTION_KEY');

if (isProduction) {
  if (JWT_SECRET.length < 32 || JWT_SECRET.includes('change-this')) {
    throw new Error('FATAL: JWT_SECRET inseguro em producao. Use no minimo 32 caracteres aleatorios.');
  }

  if (ENCRYPTION_KEY.length < 32 || ENCRYPTION_KEY.includes('change-this')) {
    throw new Error('FATAL: ENCRYPTION_KEY inseguro em producao. Use no minimo 32 caracteres aleatorios.');
  }
}

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET,
  UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(__dirname, '../../public/uploads'),
  ENCRYPTION_KEY,
  MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET || ''
};
