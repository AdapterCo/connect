const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  console.error('ERRO CRÍTICO: JWT_SECRET não está definido no ambiente de produção!');
  process.exit(1);
}

if (isProduction && (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32)) {
  console.error('ERRO CRÍTICO: ENCRYPTION_KEY não está definido ou tem menos de 32 caracteres no ambiente de produção!');
  process.exit(1);
}

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-secret-not-for-production',
  DB_FILE: process.env.DB_FILE || path.join(__dirname, '../../db.json'),
  UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(__dirname, '../../public/uploads'),
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'dev-only-encryption-key-32c!'
};
