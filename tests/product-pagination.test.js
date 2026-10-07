const test = require('node:test');
const assert = require('node:assert/strict');
const { pagination } = require('../src/services/listPaginationService');

test('catalog pagination is bounded and does not accept unbounded page size', () => {
  assert.deepEqual(pagination({ page: '2', take: '999999', search: ' Moto ' }), { page: 2, take: 25, skip: 25, search: 'Moto' });
  assert.equal(pagination({ page: '-1' }).skip, 0);
  assert.equal(pagination({ search: 'x'.repeat(1000) }).search.length, 160);
});
test('paged product model query keeps tenant and seller restrictions and strips costs', async () => {
  const databasePath = require.resolve('../src/config/database');
  const servicePath = require.resolve('../src/services/productModelService');
  const savedDatabase = require.cache[databasePath], savedService = require.cache[servicePath];
  let options, countWhere;
  require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: { prisma: {
    productModel: {
      findMany: async input => { options = input; return [{ id: 'm', cost: 100, commission_rate: 5, name: 'Moto' }]; },
      count: async ({ where }) => { countWhere = where; return 40; }
    }
  } } };
  delete require.cache[servicePath];
  try {
    const result = await require(servicePath).list({ id: 'seller', company_id: 'company', role: 'seller' }, { page: '2', search: 'Moto' });
    assert.equal(options.where.company_id, 'company');
    assert.equal(options.where.is_active, true);
    assert.deepEqual(options.where.name, { contains: 'Moto', mode: 'insensitive' });
    assert.equal(options.skip, 25); assert.equal(options.take, 25);
    assert.deepEqual(countWhere, options.where);
    assert.equal(result.total, 40); assert.equal(result.page, 2);
    assert.ok(!('cost' in result.items[0])); assert.ok(!('commission_rate' in result.items[0]));
  } finally {
    if (savedDatabase) require.cache[databasePath] = savedDatabase; else delete require.cache[databasePath];
    if (savedService) require.cache[servicePath] = savedService; else delete require.cache[servicePath];
  }
});
