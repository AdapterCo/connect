const test = require('node:test');
const assert = require('node:assert/strict');
const { qualify, sellerBrief, previousQualification } = require('../src/services/leadQualificationService');
const catalog = [{ products: [
  { name: 'iPhone 13', price: 2500, variants: [{ name: '128 GB' }] },
  { name: 'iPhone 15', price: 4200, variants: [] }
] }];
const response = { message: 'Vou encaminhar voce.', status: 'interesse em compra', disable_ai: false };
const saved = qualification => ({ sender: 'system', is_note: true, text: 'Triagem do lead: ' + JSON.stringify(qualification) });

test('exact observed motorcycle conversation preserves model and cash then routes only after confirmation', () => {
  const options = { configuredPrompt: 'Moto Future (sem cestinha): R$ 5.999,99. Moto Phantom: R$ 5.999,99. Dinheiro, Pix ou Cartao.', preserveCatalogResponse: true };
  const messages = [{ sender: 'attendant', text: 'Qual modelo chamou sua atencao e como prefere pagar?' }];
  const cash = qualify({ messages }, 'dinheiro', { message: 'Qual dos nossos modelos voce tem interesse em adquirir?', intent: 'question' }, [], options);
  messages.push({ sender: 'client', text: 'dinheiro' }, saved(cash.qualification), { sender: 'attendant', text: cash.message });
  const selected = qualify({ messages, qualification_memory: { product: null, payment: 'Dinheiro', purchase_confirmed: false } }, 'Moto Future', { message: 'Voce confirma o interesse em fechar a compra desse modelo para eu direcionar voce ao vendedor?', intent: 'question' }, [], options);
  assert.equal(selected.qualification.product, 'Moto Future'); assert.equal(selected.qualification.payment, 'Dinheiro'); assert.equal(selected.handoff_requested, false);
  messages.push({ sender: 'client', text: 'Moto Future' }, saved(selected.qualification), { sender: 'attendant', text: selected.message });
  const confirmed = qualify({ messages, qualification_memory: { product: null, payment: 'Dinheiro', purchase_confirmed: false } }, 'sim', { message: 'Certo.', intent: 'question' }, [], options);
  assert.equal(confirmed.qualification.product, 'Moto Future'); assert.equal(confirmed.qualification.payment, 'Dinheiro'); assert.equal(confirmed.handoff_requested, true);
  assert.doesNotMatch(confirmed.message, /Qual aparelho|Qual produto/);
});
test('old unqualified conversations recover the named prompt model from client history', () => {
  const result = qualify({ messages: [{ sender: 'client', text: 'dinheiro' }, { sender: 'client', text: 'Moto Future' }, { sender: 'attendant', text: 'Voce confirma o interesse em fechar a compra?' }] }, 'sim', { message: 'Certo', intent: 'question' }, [], { configuredPrompt: 'Moto Future: R$ 5999', preserveCatalogResponse: true });
  assert.equal(result.qualification.product, 'Moto Future'); assert.equal(result.handoff_requested, true);
});

test('prompt-only products retain payment then confirm interest and hand off on yes', () => {
  for (const product of ['Moto X13', 'Sofa Aurora', 'Plano Premium']) {
    const options = { configuredPrompt: `Produtos da loja: ${product}. Preco e condicoes definidos pela loja.`, preserveCatalogResponse: true };
    const chat = { messages: [{ sender: 'client', text: `Me fale sobre ${product}` }, { sender: 'attendant', text: `O que achou dela? Como prefere realizar o pagamento (Dinheiro, Pix ou Cartao)?` }] };
    const answer = qualify(chat, 'dinheiro', { message: 'Qual produto?', intent: 'purchase', qualification: { product } }, [], options);
    assert.equal(answer.qualification.product, product); assert.equal(answer.qualification.payment, 'Dinheiro');
    assert.equal(answer.handoff_requested, false); assert.match(answer.message, /Deseja confirmar o interesse/);
    const confirmed = qualify({ messages: [...chat.messages, { sender: 'client', text: 'dinheiro' }, saved(answer.qualification), { sender: 'attendant', text: answer.message }] }, 'sim', { message: 'Vou chamar um vendedor.', intent: 'question' }, [], options);
    assert.equal(confirmed.handoff_requested, true); assert.equal(confirmed.qualification.product, product); assert.equal(confirmed.qualification.payment, 'Dinheiro');
  }
});
test('a contextual selection of a generic prompt product survives payment in the next message', () => {
  const options = { configuredPrompt: 'Sofa Aurora - cor azul - R$ 1000', preserveCatalogResponse: true };
  const chosen = qualify({ messages: [{ sender: 'attendant', text: 'O Sofa Aurora tem cor azul.' }] }, 'quero esse', { message: 'Como prefere pagar?', intent: 'question', qualification: { product: 'Sofa Aurora' } }, [], options);
  assert.equal(chosen.qualification.product, 'Sofa Aurora'); assert.equal(chosen.handoff_requested, false);
  const paid = qualify({ messages: [saved(chosen.qualification), { sender: 'attendant', text: chosen.message }] }, 'dinheiro', { message: 'Certo', intent: 'question' }, [], options);
  assert.equal(paid.handoff_requested, true); assert.equal(paid.qualification.product, 'Sofa Aurora');
});
test('a payment answer cannot introduce an unrelated prompt product or force purchase interest', () => {
  const options = { configuredPrompt: 'Sofa Aurora e Moto X13', preserveCatalogResponse: true };
  const result = qualify({ messages: [{ sender: 'client', text: 'oi' }, { sender: 'attendant', text: 'Como prefere pagar?' }] }, 'dinheiro', { message: 'Certo', intent: 'purchase', qualification: { product: 'Moto X13' } }, [], options);
  assert.equal(result.qualification.product, null); assert.equal(result.handoff_requested, false); assert.equal(result.qualification.purchase_confirmed, false);
});

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
  for (const term of ['catálogo', 'catalogo', 'catálogos', 'produtos', 'motos', 'celulares', 'lista', 'listas', 'aparelhos', 'lista de aparelhos', 'iphones', 'telefones', 'Quero ver os IPHONES', 'Me envie a lista de produtos']) {
    const result = qualify({ messages: [] }, term, { ...response, intent: 'purchase', disable_ai: true }, [{ products }]);
    assert.equal(result.handoff_requested, false, term); assert.equal(result.disable_ai, false, term);
    for (const product of products) assert.ok(result.message.includes(product.name + ':'), `${term}: ${product.name}`);
  }
});
test('lista de aparelhos replaces an invented catalog from AI or previous messages with database items only', () => {
  const previousCatalog = 'iPhone 12 - R$ 2100, entrada R$ 1000, 12x R$ 155, garantia 90 dias';
  const result = qualify({ messages: [{ sender: 'ai', text: previousCatalog }] }, 'lista de aparelhos', { ...response, intent: 'question', message: previousCatalog }, [{ products: [{ name: 'Iphone 15', price: 3000, variants: [] }] }]);
  assert.match(result.message, /Iphone 15: R\$ 3000.00/);
  assert.doesNotMatch(result.message, /iPhone 12|2100|entrada|12x|garantia/);
  assert.equal(result.handoff_requested, false);
  const empty = qualify({ messages: [] }, 'lista de aparelhos', { ...response, message: previousCatalog }, []);
  assert.match(empty.message, /Nao encontrei/); assert.doesNotMatch(empty.message, /iPhone 12/);
});
test('catalog keyword does not override an explicit request for a human', () => {
  const result = qualify({ messages: [] }, 'quero falar com um vendedor sobre os celulares', response, catalog);
  assert.equal(result.handoff_requested, true);
});
test('real AI catalog replies retain the full configured list and payment conditions even with partial CRM catalog', () => {
  const complete = 'iPhone 12: R$ 2100, entrada R$ 1000, boleto 12x R$ 155, garantia 90 dias\niPhone 13: R$ 3190\nMoto Honda: R$ 9000';
  for (const term of ['catálogo', 'catalogo', 'produtos', 'motos', 'celulares', 'listas', 'iphones', 'telefones', 'lista de aparelhos']) {
    for (const dbCatalog of [catalog, []]) {
      const result = qualify({ messages: [] }, term, { ...response, intent: 'browse', message: complete }, dbCatalog, { preserveCatalogResponse: true });
      assert.equal(result.message, complete, term);
      assert.equal(result.handoff_requested, false); assert.equal(result.disable_ai, false);
    }
  }
});
test('purchase gathers device then payment before routing', () => {
  const initial = qualify({ messages: [] }, 'quero comprar um iphone', { ...response, intent: 'purchase' }, catalog);
  assert.equal(initial.handoff_requested, false);
  assert.match(initial.message, /Qual produto/);
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


test('prompt-defined financing qualifies a generic product without forcing fixed payment options', () => {
  const result = qualify({ messages: [] }, 'quero comprar a Moto Future com financiamento', {
    message: 'Vou chamar o vendedor.', intent: 'purchase', qualification: { product: 'Moto Future', payment: 'Financiamento' }
  }, [], { configuredPrompt: 'Moto Future, pagamento com Financiamento.', preserveCatalogResponse: true });
  assert.equal(result.qualification.payment, 'Financiamento');
  assert.equal(result.qualification.product, 'Moto Future');
  assert.equal(result.handoff_requested, true);
});

test('human handoff signal works when the custom AI keeps disable_ai false', () => {
  const result = qualify({ messages: [] }, 'preciso de ajuda pessoal', { message: 'Vou chamar um atendente.', intent: 'human', request_human: true, disable_ai: false }, []);
  assert.equal(result.handoff_requested, true);
});
