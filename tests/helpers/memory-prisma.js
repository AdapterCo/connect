// Prisma em memoria com o subconjunto de operacoes usado pelos fluxos testados.
// install() substitui @prisma/client, entao o src/config/database.js real
// (inclusive o seed) roda contra este banco.
const TABLES = ['plan', 'company', 'settings', 'user', 'instance', 'invoice', 'subscription',
  'signupCheckout', 'log', 'auditLog', 'passwordResetToken', 'chat', 'message', 'flow', 'flowSession'];

const db = {};
const reset = () => Object.assign(db, Object.fromEntries(TABLES.map(name => [name, []])));
reset();

const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('in' in value) return value.in.includes(row[key]);
    if ('not' in value) return row[key] !== value.not;
    return true;
  }
  return row[key] === value;
});

const apply = (row, data) => {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    row[key] = value && typeof value === 'object' && 'increment' in value ? (row[key] || 0) + value.increment : value;
  }
  return row;
};

const model = name => ({
  findUnique: async ({ where }) => db[name].find(r => matches(r, where)) || null,
  findFirst: async ({ where } = {}) => db[name].find(r => matches(r, where)) || null,
  findMany: async ({ where } = {}) => db[name].filter(r => matches(r, where)),
  count: async ({ where } = {}) => db[name].filter(r => matches(r, where)).length,
  create: async ({ data }) => { const row = { id: data.id || `${name}_${db[name].length + 1}`, created_at: new Date(), updated_at: new Date(), ...data }; db[name].push(row); return row; },
  update: async ({ where, data }) => ({ ...apply(db[name].find(r => matches(r, where)), { ...data, updated_at: new Date() }) }),
  updateMany: async ({ where, data }) => { const rows = db[name].filter(r => matches(r, where)); rows.forEach(r => apply(r, data)); return { count: rows.length }; },
  deleteMany: async ({ where } = {}) => { const before = db[name].length; db[name] = db[name].filter(r => !matches(r, where)); return { count: before - db[name].length }; },
  upsert: async ({ where, update, create }) => {
    const row = db[name].find(r => matches(r, where));
    return row ? apply(row, update) : model(name).create({ data: create });
  }
});

const prisma = Object.fromEntries(TABLES.map(name => [name, model(name)]));
prisma.$transaction = async fn => fn(prisma);
prisma.$queryRaw = async () => [{ '?column?': 1 }];

function install() {
  process.env.JWT_SECRET = 'test-only-secret-'.repeat(3);
  process.env.ENCRYPTION_KEY = 'test-only-key-'.repeat(3);
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  require.cache[require.resolve('@prisma/client')] = { exports: { PrismaClient: function PrismaClient() { return prisma; } } };
}

module.exports = { db, reset, prisma, install };
