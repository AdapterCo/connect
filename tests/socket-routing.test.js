const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'socket-test-secret-'.repeat(3);
process.env.ENCRYPTION_KEY = 'socket-test-key-'.repeat(3);
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
require.cache[require.resolve('socket.io')] = { exports: { Server: class {
  constructor() { this.sockets = { sockets: new Map() }; }
  use() {}
  on() {}
} } };
const { initSocket, emitToCompany } = require('../src/config/socket');

test('transfer only exposes the conversation to the new owner and company managers', () => {
  const io = initSocket({});
  const received = {};
  for (const [id, role, company_id] of [['old', 'seller', 'c1'], ['new', 'seller', 'c1'], ['admin', 'admin', 'c1'], ['supervisor', 'supervisor', 'c1'], ['external', 'admin', 'c2']]) {
    received[id] = [];
    io.sockets.sockets.set(id, { user: { id, role, company_id }, emit: (event, data) => received[id].push({ event, data }) });
  }
  const chat = { id: 'chat1', assigned_to: 'new', messages: [{ text: 'private content' }] };
  emitToCompany('c1', 'chat_updated', chat);
  assert.deepEqual(received.old, [{ event: 'chat_removed', data: { id: 'chat1' } }]);
  for (const id of ['new', 'admin', 'supervisor']) assert.deepEqual(received[id], [{ event: 'chat_updated', data: chat }]);
  assert.deepEqual(received.external, []);
});
