// Temporary dependency: npm install --prefix scratch/migration-qa @electric-sql/pglite --ignore-scripts
// Run: node --test tests/integration/commercial-migrations.test.js
// Executes PostgreSQL SQL in an isolated, in-memory WASM engine; never reads DATABASE_URL.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '../../scratch/migration-qa/node_modules/@electric-sql/pglite');
const db = new PGlite();
test.before(async () => {
  const root = path.join(__dirname, '../../prisma/migrations');
  for (const migration of fs.readdirSync(root).filter(name => fs.existsSync(path.join(root, name, 'migration.sql'))).sort()) {
    if (migration === '20261003000100_commercial_crm') {
      await db.exec(`INSERT INTO "Company" (id,name,slug,updated_at) VALUES ('c1','Test 1','test1',now()),('c2','Test 2','test2',now());
        INSERT INTO "User" (id,name,username,password,role,company_id,updated_at) VALUES ('s1','One','test1','synthetic','seller','c1',now()),('s2','Two','test2','synthetic','seller','c2',now());
        INSERT INTO "Category" (id,name,slug,company_id,updated_at) VALUES ('cat1','Phones','phones','c1',now());
        INSERT INTO "Product" (id,name,slug,price,category_id,company_id,seller_id,status,sold_at,payment_method,serial,updated_at) VALUES ('old-sale','Legacy phone','legacy',100.50,'cat1','c1','s1','sold',now(),'pix','LEGACY-IMEI',now());`);
    }
    await db.exec(fs.readFileSync(path.join(root, migration, 'migration.sql'), 'utf8'));
  }
});
test.after(() => db.close());
test('all migrations apply, preserving existing products and creating their financial snapshots', async () => {
  const result = await db.query('SELECT total,status FROM "Sale" WHERE product_id=$1', ['old-sale']);
  assert.equal(result.rows.length, 1); assert.equal(Number(result.rows[0].total), 100.5); assert.equal(result.rows[0].status, 'sold');
  assert.equal((await db.query('SELECT * FROM "SaleReceipt"')).rows.length, 0);
});
test('PostgreSQL rejects cross-company opportunity and sales ownership', async () => {
  await assert.rejects(db.exec(`INSERT INTO "Opportunity" (id,company_id,client_name,phone,seller_id,updated_at) VALUES ('foreign','c1','Client','5521999999999','s2',now());`), /foreign key/i);
  await db.exec(`INSERT INTO "Opportunity" (id,company_id,client_name,phone,seller_id,updated_at) VALUES ('lead','c1','Client','5521999999999','s1',now());`);
  await assert.rejects(db.exec(`INSERT INTO "FollowUpTask" (id,company_id,opportunity_id,owner_id,title,due_at) VALUES ('task','c2','lead','s2','Test',now());`), /foreign key/i);
});
test('PostgreSQL rejects duplicate customer keys and duplicate sale of a unit', async () => {
  await assert.rejects(db.exec(`INSERT INTO "Opportunity" (id,company_id,client_name,phone,updated_at) VALUES ('duplicate','c1','Client','5521999999999',now());`), /unique/i);
  await assert.rejects(db.exec(`INSERT INTO "Sale" (id,company_id,product_id,seller_id,total,payment_method) VALUES ('duplicate-sale','c1','old-sale','s1',100.50,'pix');`), /unique/i);
});
test('PostgreSQL rejects nonpositive receipts and inconsistent reservations', async () => {
  await assert.rejects(db.exec(`INSERT INTO "SaleReceipt" (id,company_id,sale_id,created_by,amount,kind,method,request_id) VALUES ('receipt','c1','legacy-sale-old-sale','s1',-1,'payment','pix','bad');`), /check constraint/i);
  await assert.rejects(db.exec(`UPDATE "Product" SET reserved_by='s1' WHERE id='old-sale';`), /check constraint/i);
});
test('new relations preserve company cascading deletion', async () => {
  await db.exec('BEGIN; DELETE FROM "Company" WHERE id=\'c1\';');
  assert.equal((await db.query('SELECT * FROM "Sale" WHERE company_id=\'c1\'')).rows.length, 0);
  await db.exec('ROLLBACK;');
});
test('catalog migration preserves legacy sales and groups their product model', async () => {
  const result = await db.query('SELECT p.model_id,m.name,m.kind FROM "Product" p JOIN "ProductModel" m ON p.model_id=m.id WHERE p.id=$1', ['old-sale']);
  assert.equal(result.rows.length, 1); assert.equal(result.rows[0].name, 'Legacy phone'); assert.equal(result.rows[0].kind, 'phone');
});
test('catalog foreign keys prohibit linking physical units to another tenant model', async () => {
  await db.exec(`INSERT INTO "ProductModel" (id,company_id,name,kind,price,updated_at) VALUES ('foreign-model','c2','Other phone','phone',200,now());`);
  await assert.rejects(db.exec(`UPDATE "Product" SET model_id='foreign-model' WHERE id='old-sale';`), /foreign key/i);
  await assert.rejects(db.exec(`INSERT INTO "ProductModel" (id,company_id,name,kind,price,updated_at) VALUES ('bad-kind','c1','Invalid','invalid',200,now());`), /check constraint/i);
});
