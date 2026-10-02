const test = require('node:test');
const assert = require('node:assert/strict');
const { qualify, sellerBrief, previousQualification } = require('../src/services/leadQualificationService');
const catalog = [{ products: [
  { name: 'iPhone 13', price: 2500, variants: [{ name: '128 GB' }] },
  { name: 'iPhone 15', price: 4200, variants: [] }
] }];
const response = { message: 'Vou encaminhar voce.', status: 'interesse em compra', disable_ai: false };
const saved = qualification => ({ sender: 'system', is_note: true, text: 'Triagem do lead: ' + JSON.stringify(qualification) });

test('viewing iPhones shows catalog even if AI incorrectly asks for a handoff', () => {
  const result = qualify({ messages: [] }, 'quero ver os iphones', { ...response, disable_ai: true, intent: 'purchase' }, catalog);
  assert.equal(result.handoff_requested, false);
  assert.equal(result.status, 'iniciada');
  assert.match(result.message, /iPhone 13: R\$ 2500.00/);
  assert.doesNotMatch(result.message, /encaminhar/);
});
test('empty catalog is explained without inventing products or transferring', () => {
  const result = qualify({ messages: [] }, 'quero ver os iphones', response, []);
  assert.equal(result.handoff_requested, false);
  assert.match(result.message, /Nao encontrei/);
});
test('purchase gathers device then payment before routing', () => {
  const initial = qualify({ messages: [] }, 'quero comprar um iphone', { ...response, intent: 'purchase' }, catalog);
  assert.equal(initial.handoff_requested, false);
  assert.match(initial.message, /Qual aparelho/);
  const chosen = qualify({ messages: [saved(initial.qualification)] }, 'quero levar o iPhone 13 de 128 GB', { ...response, intent: 'purchase', qualification: { product: 'iPhone 13', variant: '128 GB' } }, catalog);
  assert.equal(chosen.handoff_requested, false);
  assert.match(chosen.message, /Como prefere pagar/);
  const paid = qualify({ messages: [saved(chosen.qualification)] }, 'prefiro Pix', { ...response, intent: 'question', qualification: { payment: 'Pix' } }, catalog);
  assert.equal(paid.handoff_requested, true);
  assert.equal(paid.qualification.product, 'iPhone 13');
  assert.equal(paid.qualification.variant, '128 GB');
  assert.equal(paid.qualification.payment, 'Pix');
});
test('explicit human request bypasses qualification and preserves context', () => {
  const result = qualify({ messages: [{ sender: 'client', text: 'Meu celular quebrou' }] }, 'quero falar com alguem', response, catalog);
  assert.equal(result.handoff_requested, true);
  assert.match(sellerBrief(result.qualification), /Meu celular quebrou/);
  assert.match(sellerBrief(result.qualification), /Pagamento: nao escolhido/);
});
test('qualification ignores invented selections and internal notes', () => {
  const result = qualify({ messages: [{ sender: 'attendant', is_note: true, text: 'iPhone 15 Pix' }] }, 'oi', { ...response, qualification: { product: 'iPhone 15', payment: 'Pix' } }, catalog);
  assert.equal(result.qualification.product, null);
  assert.equal(result.qualification.payment, null);
  assert.doesNotMatch(result.qualification.context, /iPhone 15/);
  assert.deepEqual(previousQualification({ messages: [saved(result.qualification)] }), result.qualification);
});

test('general questions after transfer keep the AI answer without another handoff', () => {
  const qualification = { product: 'iPhone 13', payment: 'Pix', purchase_confirmed: true };
  const result = qualify({ status: 'interesse em compra', messages: [saved(qualification)] }, 'qual o horario da loja?', { ...response, intent: 'question', message: 'Abrimos as 9h.' }, catalog);
  assert.equal(result.handoff_requested, false);
  assert.equal(result.message, 'Abrimos as 9h.');
});

test('availability is browsing even if the model wrongly labels it as a purchase', () => {
  const result = qualify({ messages: [] }, 'tem iPhone 13 disponivel?', { ...response, intent: 'purchase', qualification: { product: 'iPhone 13', payment: 'Pix' } }, catalog);
  assert.equal(result.handoff_requested, false);
  assert.equal(result.qualification.product, null);
});

test('asking whether Pix is accepted is not a confirmed payment choice', () => {
  const result = qualify({ messages: [] }, 'aceita Pix?', { ...response, intent: 'question', qualification: { payment: 'Pix' } }, catalog);
  assert.equal(result.qualification.payment, null);
  assert.equal(result.handoff_requested, false);
});

test('an already routed customer requesting purchase gets the waiting reminder', () => {
  const result = qualify({ status: 'interesse em compra', messages: [] }, 'quero comprar agora', { ...response, intent: 'purchase' }, catalog);
  assert.equal(result.handoff_requested, true);
});
