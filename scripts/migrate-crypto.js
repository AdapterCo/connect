/**
 * scripts/migrate-crypto.js
 * [M5] Migracao de segredos legados AES-256-CBC para AES-256-GCM
 *
 * Re-encripta todos os campos sensiveis que ainda usam formato legado (sem prefixo v2:).
 * Seguro para rodar multiplas vezes (idempotente).
 *
 * Uso:
 *   node scripts/migrate-crypto.js
 *   node scripts/migrate-crypto.js --dry-run   (apenas lista, nao altera)
 */

'use strict';

require('dotenv').config();

const { encrypt, decrypt } = require('../src/utils/crypto');
const { prisma } = require('../src/config/database');

const DRY_RUN = process.argv.includes('--dry-run');

function needsMigration(value) {
  if (!value) return false;
  if (String(value).startsWith('v2:')) return false;
  if (!String(value).includes(':')) return false;
  return true;
}

async function migrateSettings() {
  const settings = await prisma.settings.findMany();
  let migrated = 0;
  for (const s of settings) {
    const fields = ['gemini_key', 'openai_key', 'grok_key'];
    const updates = {};
    let hasChanges = false;
    for (const field of fields) {
      if (needsMigration(s[field])) {
        const plain = decrypt(s[field]);
        if (plain !== null) {
          updates[field] = encrypt(plain);
          hasChanges = true;
          console.log(`  [Settings] id=${s.id} campo=${field} re-encriptado`);
        } else {
          console.warn(`  [Settings] id=${s.id} campo=${field} FALHA ao descriptografar, pulado`);
        }
      }
    }
    if (hasChanges && !DRY_RUN) {
      await prisma.settings.update({ where: { id: s.id }, data: updates });
      migrated++;
    } else if (hasChanges && DRY_RUN) {
      migrated++;
    }
  }
  return migrated;
}

async function migrateCompanies() {
  const companies = await prisma.company.findMany({
    select: { id: true, mp_access_token: true }
  });
  let migrated = 0;
  for (const c of companies) {
    if (!needsMigration(c.mp_access_token)) continue;
    const plain = decrypt(c.mp_access_token);
    if (plain !== null) {
      console.log(`  [Company] id=${c.id} campo=mp_access_token re-encriptado`);
      if (!DRY_RUN) {
        await prisma.company.update({
          where: { id: c.id },
          data: { mp_access_token: encrypt(plain) }
        });
      }
      migrated++;
    } else {
      console.warn(`  [Company] id=${c.id} campo=mp_access_token FALHA ao descriptografar, pulado`);
    }
  }
  return migrated;
}

async function main() {
  console.log(`\n[Crypto Migration] AES-CBC -> AES-GCM${DRY_RUN ? ' [DRY RUN]' : ''}\n`);
  try {
    console.log('Settings:');
    const s = await migrateSettings();
    console.log('\nCompanies (mp_access_token):');
    const c = await migrateCompanies();
    const total = s + c;
    console.log(`\nMigracao ${DRY_RUN ? 'simulada' : 'concluida'}: ${total} campo(s) ${DRY_RUN ? 'precisam de migracao' : 'migrados'}.`);
    if (total === 0) console.log('  Nenhum registro legado. Todos ja estao no formato GCM.');
  } catch (err) {
    console.error('\nErro durante migracao:', err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
