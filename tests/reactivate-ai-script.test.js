const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs, candidateWhere, manuallyDisabledNames } = require('../scripts/reactivate-ai-after-outage');

test('reactivation script lists by default and only changes with --apply', () => {
  assert.deepEqual(parseArgs(['--since', '2026-11-21']), { since: new Date('2026-11-21T03:00:00.000Z'), apply: false });
  assert.equal(parseArgs(['--since', '2026-11-21', '--apply']).apply, true);
  assert.throws(() => parseArgs([]), /--since/);
  assert.throws(() => parseArgs(['--since', '21/11']), /--since/);
});

test('reactivation targets only store chats turned off by a manual reply', () => {
  const where = candidateWhere(new Date('2026-11-21T03:00:00.000Z'));
  assert.deepEqual(where.instance, { user_id: null });
  assert.equal(where.is_blocked, false);
  assert.equal(where.is_archived, false);
  assert.equal(where.messages.some.is_ai, false);
  assert.match(where.messages.none.text.startsWith, /erro no nosso sistema/);
  const skip = manuallyDisabledNames([
    { company_id: 'c1', message: 'IA do atendente virtual para Ana foi desativada por Joao.' },
    { company_id: 'c1', message: 'IA do atendente virtual para Bia foi ativada por Joao.' }
  ]);
  assert.deepEqual([...skip], ['c1|Ana']);
});
