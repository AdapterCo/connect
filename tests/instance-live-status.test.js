const test = require('node:test');
const assert = require('node:assert/strict');

test('instance listing uses live transport and preserves seller isolation', async () => {
  const modelPath = require.resolve('../src/models/Instance');
  const servicePath = require.resolve('../src/services/whatsappService');
  const controllerPath = require.resolve('../src/controllers/instanceController');
  const paths = [modelPath, servicePath, controllerPath];
  const saved = paths.map(path => require.cache[path]);
  const instances = ['missing', 'closed', 'open', 'starting', 'other'].map(id => ({
    id, status: 'open', user_id: id === 'other' ? 'another' : 'seller'
  }));
  const connections = {
    closed: { connectionStatus: 'open', sock: { ws: { isOpen: false } } },
    open: { connectionStatus: 'open', sock: { ws: { isOpen: true } } },
    starting: { connectionStatus: 'connecting' }
  };
  try {
    require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: { findAll: async () => instances } };
    require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: { getActiveConnections: () => connections } };
    delete require.cache[controllerPath];
    let result;
    await require(controllerPath).getInstances(
      { user: { id: 'seller', role: 'seller', company_id: 'company' } },
      { json: value => { result = value; }, status: () => assert.fail('unexpected controller failure') }
    );
    assert.deepEqual(result.map(({ id, status }) => [id, status]), [
      ['missing', 'disconnected'], ['closed', 'disconnected'], ['open', 'open'], ['starting', 'connecting']
    ]);
  } finally {
    paths.forEach((path, index) => {
      if (saved[index]) require.cache[path] = saved[index];
      else delete require.cache[path];
    });
  }
});
