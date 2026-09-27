const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('Configure JWT_SECRET com pelo menos 32 caracteres.');
if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) throw new Error('Configure ENCRYPTION_KEY com pelo menos 32 caracteres.');

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET,
  DB_FILE: process.env.DB_FILE || path.join(__dirname, '../../db.json'),
  UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(__dirname, '../../public/uploads'),
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY
};
