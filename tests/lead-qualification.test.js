const test = require('node:test');
const assert = require('node:assert/strict');
const { qualify, sellerBrief, previousQualification } = require('../src/services/leadQualificationService');
const catalog = [{ products: [
  { name: 'iPhone 13', price: 2500, variants: [{ name: '128 GB' }] },
  { name: 'iPhone 15', price: 4200, variants: [] }
] }];
const response = { message: 'Vou encaminhar voce.', status: 'interesse em compra', disable_ai: false };
const saved = qualification => ({ sender: 'system', is_note: true, text: 'Triagem do lead: ' + JSON.stringify(qualification) });

test('structured preferences survive missing history and cannot be reverted by old client selections', () => {
  const result = qualify({ messages: [{ sender: 'client', text: 'quero iPhone 13 no boleto' }], qualification_memory: { product: 'iPhone 15', payment: 'Pix', variant: '256 GB', purchase_confirmed: true } }, 'qual o horário?', { message: 'Abrimos às 9h.', intent: 'question' }, catalog);
  assert.equal(result.qualification.product, 'iPhone 15'); assert.equal(result.qualification.payment, 'Pix');
});
test('customer may change a device and payment without restarting qualification', () => {
  const result = qualify({ messages: [saved({ product: 'iPhone 13', payment: 'Pix', purchase_confirmed: true })] }, 'quero iPhone 15 no boleto', response, catalog);
  assert.equal(result.qualification.product, 'iPhone 15'); assert.equal(result.qualification.payment, 'Boleto'); assert.equal(result.handoff_requested, true);
});
test('payment correction with negation does not retain the rejected method', () => {
  const result = qualify({ messages: [saved({ product: 'iPhone 13', payment: 'Pix', purchase_confirmed: true })] }, 'não quero Pix, prefiro boleto', { message: 'Certo.', intent: 'question' }, catalog);
  assert.equal(result.qualification.payment, 'Boleto'); assert.equal(result.qualification.purchase_confirmed, true);
});
test('rejecting the previous device and selecting another preserves the new choice', () => {
  const result = qualify({ messages: [saved({ product: 'iPhone 13', payment: 'Pix', purchase_confirmed: true })] }, 'não quero mais iPhone 13, quero iPhone 15 no boleto', { message: 'Certo.', intent: 'question' }, catalog);
  assert.equal(result.qualification.product, 'iPhone 15'); assert.equal(result.qualification.payment, 'Boleto'); assert.equal(result.handoff_requested, true);
});
test('withdrawal clears purchase choices and does not hand off', () => {
  const result = qualify({ messages: [saved({ product: 'iPhone 13', payment: 'Pix', purchase_confirmed: true })] }, 'desisti de comprar', { message: 'Certo.', intent: 'question' }, catalog);
  assert.equal(result.qualification.product, null); assert.equal(result.qualification.payment, null); assert.equal(result.handoff_requested, false);
});

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
test('catalog keywords always show the entire store catalog beyond eight items and across categories', () => {
  const products = Array.from({ length: 12 }, (_, index) => ({ name: index === 11 ? 'Moto Honda' : `Celular modelo ${index + 1}`, price: 100 + index, variants: [] }));
  for (const term of ['catálogo', 'catalogo', 'produtos', 'motos', 'celulares', 'listas', 'iphones', 'telefones', 'Quero ver os IPHONES', 'Me envie a lista de produtos']) {
    const result = qualify({ messages: [] }, term, { ...response, intent: 'purchase', disable_ai: true }, [{ products }]);
    assert.equal(result.handoff_requested, false, term); assert.equal(result.disable_ai, false, term);
    for (const product of products) assert.ok(result.message.includes(product.name + ':'), `${term}: ${product.name}`);
  }
});
test('catalog keyword does not override an explicit request for a human', () => {
  const result = qualify({ messages: [] }, 'quero falar com um vendedor sobre os celulares', response, catalog);
  assert.equal(result.handoff_requested, true);
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

test('customer exact Pro Max and boleto selection routes without relying on AI extraction or catalog match', () => {
  const result = qualify({ messages: [] }, 'iPhone 13 Pro Max no boleto', { message: 'Qual modelo?', intent: 'question' }, catalog);
  assert.equal(result.handoff_requested, true);
  assert.equal(result.qualification.product, 'iPhone 13 Pro Max');
  assert.equal(result.qualification.payment, 'Boleto');
  assert.equal(result.qualification.catalog_confirmed, false);
  assert.match(sellerBrief(result.qualification), /disponibilidade e preco precisam ser confirmados/);
});

test('exact customer sequence preserves boleto while model is confirmed in another message', () => {
  const first = qualify({ messages: [] }, 'iPhone 13 Pro Max no boleto', response, []);
  const second = qualify({ messages: [saved(first.qualification)] }, 'quero o iPhone 13 Pro Max', { message: 'Qual modelo?', intent: 'question' }, []);
  assert.equal(second.handoff_requested, true);
  assert.equal(second.qualification.product, 'iPhone 13 Pro Max');
  assert.equal(second.qualification.payment, 'Boleto');
});

test('qualification asks a missing field once then routes with available context', () => {
  const first = qualify({ messages: [] }, 'quero comprar um iphone', { ...response, intent: 'purchase' }, catalog);
  assert.equal(first.handoff_requested, false);
  const repeated = qualify({ messages: [saved(first.qualification)] }, 'ja falei, quero comprar', { ...response, intent: 'purchase' }, catalog);
  assert.equal(repeated.handoff_requested, true);
  assert.equal(repeated.qualification.product, null);
});

test('a concrete model on its own is recognized and asks only for missing payment', () => {
  const result = qualify({ messages: [] }, 'iPhone 13 Pro Max', { message: 'Qual modelo?', intent: 'question' }, []);
  assert.equal(result.handoff_requested, false);
  assert.equal(result.qualification.product, 'iPhone 13 Pro Max');
  assert.match(result.message, /Como prefere pagar/);
});

test('forwarded and attendance stages answer general questions without restarting qualification', () => {
  for (const status of ['encaminhados', 'em atendimento']) {
    const result = qualify({ status, messages: [] }, 'qual o horario da loja?', { message: 'Abrimos as 9h.', intent: 'question' }, catalog);
    assert.equal(result.handoff_requested, false);
    assert.equal(result.message, 'Abrimos as 9h.');
  }
});
