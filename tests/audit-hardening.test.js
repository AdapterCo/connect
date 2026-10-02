const test = require('node:test');
const assert = require('node:assert/strict');
const { db, reset, install } = require('./helpers/memory-prisma');
install();
const { getUserInstanceIds, updateUser } = require('../src/models/Instance');
const { chatScope, canSeeChat } = require('../src/services/accessService');
const { registerTenant, logout } = require('../src/controllers/authController');
const { nextMonth } = require('../src/utils/billingDate');
const { validContent } = require('../src/utils/fileValidation');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
test.beforeEach(reset);
test('declared phone never grants instance access or mutates ownership', async () => {
  db.instance.push({ id: 'i1', company_id: 'c1', phone: '5511999999999', user_id: 'other' }, { id: 'i2', company_id: 'c1', phone: '5511999999999', user_id: null });
  assert.deepEqual(await getUserInstanceIds({ id: 'seller', role: 'seller', phone: '5511999999999' }, 'c1'), []);
  assert.equal(db.instance[1].user_id, null);
});
test('instance cannot be linked to a user of another tenant', async () => {
  db.user.push({ id: 'u2', company_id: 'c2' });
  await assert.rejects(updateUser('i1', 'u2', 'c1'), /empresa/);
});
test('assignment and owned instance are both valid, sector and tenant still apply', async () => {
  const user = { id: 'u1', company_id: 'c1', role: 'seller' };
  db.instance.push({ id: 'i1', company_id: 'c1', user_id: 'u1' });
  const scope = await chatScope(user);
  assert.deepEqual(scope.OR, [{ assigned_to: 'u1' }, { instance_id: { in: ['i1'] } }]);
  assert.equal(canSeeChat(user, { company_id: 'c1', assigned_to: 'u1', instance_id: 'store', sector: 'sales' }, ['i1']), true);
  assert.equal(canSeeChat(user, { company_id: 'c2', assigned_to: 'u1', sector: 'sales' }, ['i1']), false);
  assert.equal(canSeeChat(user, { company_id: 'c1', assigned_to: 'u1', sector: 'support' }, ['i1']), false);
});
test('public registration cannot overwrite a pending checkout or detach its payment', async () => {
  db.plan.push({ id: 'p1', price: 100, is_active: true });
  db.signupCheckout.push({ id: 'victim', company_id: null, company_slug: 'loja', admin_username: 'owner', status: 'pending', admin_password: 'hash', mp_payment_id: '555', created_at: new Date() });
  const res = response();
  await registerTenant({ body: { companyName: 'Loja', companySlug: 'loja', adminName: 'Attacker', adminUsername: 'attacker', adminPassword: 'test-only-password', planId: 'p1' } }, res);
  assert.equal(res.code, 409);
  assert.equal(db.signupCheckout[0].admin_username, 'owner');
  assert.equal(db.signupCheckout[0].mp_payment_id, '555');
});
test('logout revokes existing JWT versions', async () => {
  db.user.push({ id: 'u1', company_id: 'c1', session_version: 4 });
  await logout({ user: { id: 'u1', company_id: 'c1' } }, response());
  assert.equal(db.user[0].session_version, 5);
});
test('monthly billing clamps end of month and preserves UTC time', () => {
  assert.equal(nextMonth('2026-01-31T12:00:00Z').toISOString(), '2026-02-28T12:00:00.000Z');
  assert.equal(nextMonth('2028-01-31T12:00:00Z').toISOString(), '2028-02-29T12:00:00.000Z');
});
test('forged image MIME and executable masquerading as PDF are rejected', () => {
  assert.equal(validContent(Buffer.from('<script>alert(1)</script>'), 'image/png'), false);
  assert.equal(validContent(Buffer.from('MZ-malware'), 'application/pdf'), false);
  assert.equal(validContent(Buffer.from('89504e470d0a1a0a', 'hex'), 'image/png'), true);
});

test('a deleted user filter cannot fall back to the entire company chat list', async () => {
  await assert.rejects(require('../src/models/Chat').findForList('c1', 'deleted'), /Usuario indisponivel/);
});
test('a filter object from another tenant cannot change the requested chat company', async () => {
  await assert.rejects(require('../src/models/Chat').findForList('c1', { id: 'u2', company_id: 'c2', role: 'seller' }), /Usuario indisponivel/);
});
