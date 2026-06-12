const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'crm-super-secret-key-123',
  DB_FILE: process.env.DB_FILE || path.join(__dirname, '../../db.json'),
  UPLOAD_DIR: process.env.UPLOAD_DIR || path.join(__dirname, '../../public/uploads'),
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || 'default-secret-key-32-chars-long!'
};
