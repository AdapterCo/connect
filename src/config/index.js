const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET não definido. Configure a variável de ambiente JWT_SECRET.');
}

if (!process.env.ENCRYPTION_KEY) {
  throw new Error('FATAL: ENCRYPTION_KEY não definido. Configure a variável de ambiente ENCRYPTION_KEY.');
}

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET,
  UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(__dirname, '../../public/uploads'),
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY
};
