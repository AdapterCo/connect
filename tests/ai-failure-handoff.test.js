const test = require('node:test');
const assert = require('node:assert/strict');
const { db, reset, install } = require('./helpers/memory-prisma');
install();

const rotation = require('../src/services/salesRotationService');
const whatsapp = require('../src/services/whatsappService');

function seed() {
  reset();
  db.company.push({ id: 'c1', is_active: true, expires_at: null });
  db.chat.push({ id: 'chat1', company_id: 'c1', client_name: 'Cliente', client_phone: '5511999999999', status: 'iniciada', ai_active: true, tags: [], messages: [] });
}

test('when the AI fails the chat goes to the seller rotation and the AI stops answering it', async () => {
  seed();
  const handoffs = [];
  const original = rotation.handoffToHuman;
  rotation.handoffToHuman = async (id, companyId) => {
    handoffs.push([id, companyId]);
    return { ...db.chat.find(c => c.id === id), status: rotation.INTEREST, assigned_to: 's1' };
  };
  try {
    // Sem conexao do WhatsApp no teste: o envio falha, mas o encaminhamento continua valendo.
    await whatsapp.aiFailureHandoff(db.chat[0], 'store', 'c1');
  } finally {
    rotation.handoffToHuman = original;
  }
  assert.deepEqual(handoffs, [['chat1', 'c1']]);
  assert.equal(db.chat[0].ai_active, false);
  assert.match(whatsapp.AI_FAILURE_MESSAGE, /erro no nosso sistema/);
  assert.match(whatsapp.AI_FAILURE_MESSAGE, /vendedores/);
  assert.match(whatsapp.AI_FAILURE_MESSAGE, /aguarde/);
});

test('a chat that cannot be handed off (blocked, archived, finished) keeps its state', async () => {
  seed();
  const original = rotation.handoffToHuman;
  rotation.handoffToHuman = async () => null;
  try {
    await whatsapp.aiFailureHandoff(db.chat[0], 'store', 'c1');
  } finally {
    rotation.handoffToHuman = original;
  }
  assert.equal(db.chat[0].ai_active, true);
});
