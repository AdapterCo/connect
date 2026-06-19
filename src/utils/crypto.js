const crypto = require('crypto');
const { ENCRYPTION_KEY } = require('../config/index');

const GCM_ALGORITHM = 'aes-256-gcm';
// [M5] Legado: AES-256-CBC sem autenticação — suporte mantido apenas para leitura de registros
// antigos. DEADLINE: migrar todos os registros existentes para GCM e remover este suporte.
// Execute: node scripts/migrate-crypto.js (a ser criado) para re-encriptar com v2:.
const LEGACY_ALGORITHM = 'aes-256-cbc';
const IV_LENGTH_GCM = 12;
const IV_LENGTH_LEGACY = 16;

function getKey() {
  return crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
}

function encrypt(text) {
  if (!text) return null;

  const iv = crypto.randomBytes(IV_LENGTH_GCM);
  const cipher = crypto.createCipheriv(GCM_ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v2:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptLegacyCbc(text) {
  const parts = text.split(':');
  if (parts.length !== 2) return null;

  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');
  if (iv.length !== IV_LENGTH_LEGACY || encryptedText.length === 0) return null;

  const legacyKey = Buffer.from(String(ENCRYPTION_KEY).substring(0, 32).padEnd(32));
  const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, legacyKey, iv);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString('utf8');
}

function decrypt(text) {
  if (!text) return null;

  if (!String(text).includes(':')) {
    return text;
  }

  try {
    const parts = String(text).split(':');
    if (parts[0] === 'v2' && parts.length === 4) {
      const iv = Buffer.from(parts[1], 'hex');
      const tag = Buffer.from(parts[2], 'hex');
      const encryptedText = Buffer.from(parts[3], 'hex');
      if (iv.length !== IV_LENGTH_GCM || tag.length !== 16 || encryptedText.length === 0) return null;

      const decipher = crypto.createDecipheriv(GCM_ALGORITHM, getKey(), iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
      return decrypted.toString('utf8');
    }

    return decryptLegacyCbc(text);
  } catch (err) {
    return null;
  }
}

module.exports = { encrypt, decrypt };
