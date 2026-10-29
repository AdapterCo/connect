const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { db, reset, install } = require('./helpers/memory-prisma');
install();

require.cache[require.resolve('../src/services/whatsappService')] = {
  exports: { getActiveConnections: () => ({}), startWhatsAppInstance: async () => {}, stopWhatsAppInstance: async () => {} }
};

const { generateToken } = require('../src/config/auth');
const app = require('../app');

let server, base;
test.before(async () => { server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise(resolve => server.close(resolve)));

const minutesAgo = minutes => new Date(Date.now() - minutes * 60000);

function seed() {
  reset();
  db.company.push({ id: 'c1', is_active: true, expires_at: null });
  for (const [id, role, name] of [['a1', 'admin', 'Admin'], ['s1', 'seller', 'Beatriz'], ['s2', 'seller', 'Lissa']]) {
    db.user.push({ id, role, name, company_id: 'c1', username: id, session_version: 0 });
  }
  const lead = { company_id: 'c1', status: 'interesse em compra', is_archived: false, is_blocked: false, sales_reply_due_at: null, queued_at: null };
  db.chat.push(
    { ...lead, id: 'offered', client_name: 'Marina', assigned_to: 's1', sales_reply_due_at: new Date(Date.now() + 40000) },
    { ...lead, id: 'second', client_name: 'Carlos', queued_at: minutesAgo(2) },
    { ...lead, id: 'first', client_name: 'Joana', queued_at: minutesAgo(5) },
    { ...lead, id: 'other-company', company_id: 'c2', client_name: 'Fora', queued_at: minutesAgo(9) }
  );
  db.auditLog.push(
    { company_id: 'c1', user_id: 's2', action: 'lead_accepted', timestamp: new Date() },
    { company_id: 'c1', user_id: 's2', action: 'lead_accepted', timestamp: new Date() },
    { company_id: 'c1', user_id: 's1', action: 'lead_accepted', timestamp: new Date() },
    { company_id: 'c1', user_id: 's1', action: 'lead_accepted', timestamp: new Date('2020-01-10T12:00:00Z') }
  );
}

async function get(userId) {
  const user = db.user.find(u => u.id === userId);
  const response = await fetch(base + '/api/commercial/lead-queue', { headers: { Authorization: 'Bearer ' + generateToken({ ...user, session_version: 0 }) } });
  return { status: response.status, body: await response.json() };
}

test('managers see the offered lead, the queue in arrival order and the monthly ranking', async () => {
  seed();
  const { status, body } = await get('a1');
  assert.equal(status, 200);
  assert.deepEqual(body.offered.map(lead => [lead.client_name, lead.seller_name]), [['Marina', 'Beatriz']]);
  assert.deepEqual(body.queue.map(lead => [lead.position, lead.client_name]), [[1, 'Joana'], [2, 'Carlos']]);
  assert.deepEqual(body.ranking.map(seller => [seller.name, seller.points, seller.position]), [['Lissa', 2, 1], ['Beatriz', 1, 2]]);
});

test('sellers see positions and who holds the offer, but no client before accepting', async () => {
  seed();
  const mine = (await get('s1')).body;
  assert.equal(mine.offered[0].mine, true);
  assert.equal(mine.offered[0].id, 'offered');
  assert.equal(mine.offered[0].client_name, null);
  assert.ok(mine.queue.every(lead => lead.client_name === null && lead.id === null));
  assert.equal(mine.ranking.find(seller => seller.me).name, 'Beatriz');

  const other = (await get('s2')).body;
  assert.equal(other.offered[0].mine, false);
  assert.equal(other.offered[0].id, null);
  assert.equal(other.offered[0].seller_name, 'Beatriz');
});
