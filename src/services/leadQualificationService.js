const PREFIX = 'Triagem do lead: ';
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const clip = value => String(value || '').slice(0, 500);
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function statedDevice(text) {
  const value = String(text || '').match(/\b(?:iphone\s*\d{1,2}(?:\s*(?:pro|max|plus|mini)){0,2}|(?:samsung\s+)?galaxy\s+[aszm]\d{1,3}(?:\s*(?:ultra|plus|fe))?|moto\s+[ge]\d{1,3})\b/i);
  return value ? value[0].trim().replace(/\s+/g, ' ') : null;
}

function choiceEvidenceInText(text, value, payment = false) {
  const line = fold(text).trim();
  const name = fold(value);
  if (!name || !line.includes(name) || /\?|(?:quanto|preco|valor|aceita|quais|nao quero|nao vou|mostr|quero ver)/.test(line)) return false;
  if (line === name || (!payment && line.startsWith(name) && /^\s*(?:no|na|em|via|com)\s+(?:boleto|pix|dinheiro|cartao)\b/.test(line.slice(name.length)))) return true;
  return payment ? /(?:prefiro|pago|pagar|pagamento|vou|quero|\bno\b|\bem\b|via)/.test(line) : /(?:quero|vou|escolh|prefiro|fico|ficar|levar|comprar|esse|este)/.test(line);
}

function previousQualification(chat) {
  for (const message of [...(chat.messages || [])].reverse()) {
    if (message.sender !== 'system' || !message.is_note || !message.text?.startsWith(PREFIX)) continue;
    try {
      const parsed = JSON.parse(message.text.slice(PREFIX.length));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_) { /* Ignore old invalid notes. */ }
  }
  return {};
}

function qualify(chat, currentMessage, response, categories) {
  const prior = previousQualification(chat);
  const clientTexts = (chat.messages || []).filter(m => m.sender === 'client' && !m.is_note).slice(-20).map(m => m.text || '');
  if (clientTexts.at(-1) !== currentMessage) clientTexts.push(currentMessage);
  const evidence = fold(clientTexts.join('\n'));
  const current = fold(currentMessage);
  const products = (categories || []).flatMap(category => category.products || []);
  const requested = response.qualification || {};
  const choiceEvidence = value => clientTexts.some(text => choiceEvidenceInText(text, value));
  const customerDevice = [...clientTexts].reverse().map(statedDevice).find(name => name && choiceEvidence(name));
  const namedProduct = [...products].sort((a, b) => b.name.length - a.name.length).find(item => choiceEvidence(item.name));
  const modelProduct = typeof requested.product === 'string' && choiceEvidence(requested.product) ? requested.product : null;
  // The customer's stated model is useful even if the catalog has no exact entry.
  // Never silently replace a Pro Max with a base iPhone of the same generation.
  const statedProduct = customerDevice || namedProduct?.name || modelProduct;
  const product = products.find(item => fold(item.name) === fold(statedProduct));
  const priorProduct = products.find(item => fold(item.name) === fold(prior.product));
  const qualification = {
    product: product?.name || statedProduct || prior.product || null,
    catalog_confirmed: !!(product || (!statedProduct && priorProduct)),
    variant: null,
    payment: prior.payment || null
  };
  const chosen = product || priorProduct;
  const variants = [...(chosen?.variants || []), ...[chosen?.memory, chosen?.color].filter(Boolean).map(name => ({ name }))];
  const variant = variants.find(item => fold(item.name) === fold(requested.variant) && evidence.includes(fold(item.name)));
  qualification.variant = variant?.name || (chosen?.name === prior.product ? prior.variant || null : null);
  const payments = ['Pix', 'Dinheiro', 'Cartao', 'Boleto'];
  const payment = [...clientTexts].reverse().map(text => payments.find(item => new RegExp(`\\b${escaped(fold(item))}\\b`).test(fold(text)) && choiceEvidenceInText(text, item, true))).find(Boolean);
  if (payment) qualification.payment = payment;

  const asksHuman = !/(?:nao quero|nao precisa).{0,20}(?:falar|transferir|atendente|vendedor)/.test(current) && /(?:falar|conversar|chamar|transferir|passar|atendimento).{0,35}(?:alguem|humano|vendedor|atendente|pessoa)/.test(current);
  const browsing = /(?:quero|gostaria|posso).{0,15}(?:ver|conhecer|olhar)|(?:mostr|catalogo|quais|opcoes|modelos|quanto custa|qual.{0,8}preco|\btem\b|disponiv|funciona|diferenca)/.test(current);
  const purchase = /(?:quero|vou|gostaria|decidi).{0,20}(?:comprar|levar|fechar|ficar com)|(?:fechar|confirmar).{0,15}(?:compra|negocio|pedido)|(?:pode|vamos).{0,12}fechar/.test(current);
  const intent = asksHuman ? 'human' : browsing && !purchase ? 'browse' : response.intent;
  const explicitHuman = asksHuman || (!browsing && response.intent === 'human' && response.disable_ai === true);
  const currentSelection = !!qualification.product && choiceEvidenceInText(currentMessage, qualification.product);
  const purchaseIntent = purchase || intent === 'purchase' || (!browsing && currentSelection);
  const cancelled = /(?:nao quero|desisti|cancelar|so estou olhando)/.test(current);
  if (cancelled) qualification.payment = null;
  qualification.purchase_confirmed = !cancelled && (purchaseIntent || prior.purchase_confirmed === true);
  const ready = !!qualification.product && !!qualification.payment;
  const completesQualification = chat.status !== 'interesse em compra' && !!(statedProduct || payment || variant);
  const qualifying = qualification.purchase_confirmed && !ready && !explicitHuman && !browsing && chat.status !== 'interesse em compra';
  qualification.missing_field = !qualification.product ? 'product' : !qualification.payment ? 'payment' : null;
  qualification.questions_asked = prior.missing_field === qualification.missing_field && Number.isInteger(prior.questions_asked) ? prior.questions_asked : 0;
  const stopRepeating = qualifying && qualification.questions_asked >= 1;
  const handoff = explicitHuman || stopRepeating || (purchaseIntent && !cancelled && chat.status === 'interesse em compra') || (qualification.purchase_confirmed && ready && !browsing && (purchaseIntent || completesQualification));
  let message = response.message;
  if (qualifying && !handoff) {
    qualification.questions_asked += 1;
    message = !qualification.product
      ? 'Qual aparelho e modelo voce escolheu? Posso ajudar a comparar as opcoes do catalogo antes de encaminhar ao vendedor.'
      : `Voce escolheu ${qualification.product}. Como prefere pagar: Pix, dinheiro, cartao ou boleto?`;
  }
  if (intent === 'browse' && /(?:ver|mostr|catalogo|opcoes|modelos)/.test(current)) {
    const relevant = current.includes('iphone') ? products.filter(item => fold(item.name).includes('iphone')) : products;
    const listed = relevant.slice(0, 8).map(item => `${item.name}: R$ ${Number(item.price).toFixed(2)}${[item.memory, item.color, item.condition, item.description].filter(Boolean).length ? ' — ' + clip([item.memory, item.color, item.condition, item.description].filter(Boolean).join(', ')) : ''}`).join('\n');
    message = listed ? `Estas sao as opcoes cadastradas:\n${listed}\n\nQual modelo voce gostaria de conhecer melhor?` : 'Nao encontrei esses aparelhos no catalogo cadastrado. Qual modelo voce procura? Posso registrar sua preferencia; um vendedor precisa confirmar a disponibilidade.';
  }
  qualification.context = clientTexts.slice(-6).map(clip).join('\n').slice(0, 2000);
  return { ...response, message, status: handoff ? 'interesse em compra' : 'iniciada', disable_ai: explicitHuman, handoff_requested: handoff, qualification };
}

function sellerBrief(qualification = {}) {
  return `Aparelho: ${qualification.product || 'nao escolhido'}\n` +
    (qualification.product && qualification.catalog_confirmed === false ? 'Modelo informado pelo cliente; disponibilidade e preco precisam ser confirmados.\n' : '') +
    `Variacao: ${qualification.variant || 'nao informada'}\n` +
    `Pagamento: ${qualification.payment || 'nao escolhido'}\n` +
    `Contexto (mensagens do cliente):\n${qualification.context || 'Ainda nao informado.'}`;
}

async function saveQualification(chat, qualification) {
  if (!qualification) return;
  const previous = previousQualification(chat);
  if (JSON.stringify(previous) === JSON.stringify(qualification)) return;
  const { prisma } = require('../config/database');
  await prisma.message.create({ data: { chat_id: chat.id, sender: 'system', is_note: true, text: PREFIX + JSON.stringify(qualification) } });
}

module.exports = { qualify, previousQualification, saveQualification, sellerBrief };
