const PREFIX = 'Triagem do lead: ';
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const clip = value => String(value || '').slice(0, 500);

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
  const choiceEvidence = (value, payment = false) => clientTexts.some(text => {
    const line = fold(text).trim();
    const name = fold(value);
    if (!line.includes(name) || /\?|(?:quanto|preco|valor|aceita|quais|nao quero|nao vou|mostr|quero ver)/.test(line)) return false;
    if (line === name) return true;
    return payment ? /(?:prefiro|pago|pagar|pagamento|vou|quero|\bno\b|\bem\b|via)/.test(line) : /(?:quero|vou|escolh|prefiro|fico|ficar|levar|comprar|esse|este)/.test(line);
  });
  const product = products.find(item => fold(item.name) === fold(requested.product) && choiceEvidence(item.name));
  const priorProduct = products.find(item => item.name === prior.product);
  const qualification = {
    product: product?.name || priorProduct?.name || null,
    variant: null,
    payment: prior.payment || null
  };
  const chosen = product || priorProduct;
  const variants = [...(chosen?.variants || []), ...[chosen?.memory, chosen?.color].filter(Boolean).map(name => ({ name }))];
  const variant = variants.find(item => fold(item.name) === fold(requested.variant) && evidence.includes(fold(item.name)));
  qualification.variant = variant?.name || (chosen?.name === prior.product ? prior.variant || null : null);
  const payments = ['Pix', 'Dinheiro', 'Cartao', 'Boleto'];
  const payment = payments.find(item => fold(item) === fold(requested.payment) && choiceEvidence(item, true));
  if (payment) qualification.payment = payment;

  const asksHuman = !/(?:nao quero|nao precisa).{0,20}(?:falar|transferir|atendente|vendedor)/.test(current) && /(?:falar|conversar|chamar|transferir|passar|atendimento).{0,35}(?:alguem|humano|vendedor|atendente|pessoa)/.test(current);
  const browsing = /(?:quero|gostaria|posso).{0,15}(?:ver|conhecer|olhar)|(?:mostr|catalogo|quais|opcoes|modelos|quanto custa|qual.{0,8}preco|\btem\b|disponiv|funciona|diferenca)/.test(current);
  const purchase = /(?:quero|vou|gostaria|decidi).{0,20}(?:comprar|levar|fechar|ficar com)|(?:fechar|confirmar).{0,15}(?:compra|negocio|pedido)|(?:pode|vamos).{0,12}fechar/.test(current);
  const intent = asksHuman ? 'human' : browsing && !purchase ? 'browse' : response.intent;
  const explicitHuman = asksHuman || (!browsing && response.intent === 'human' && response.disable_ai === true);
  const purchaseIntent = purchase || intent === 'purchase';
  const cancelled = /(?:nao quero|desisti|cancelar|so estou olhando)/.test(current);
  if (cancelled) qualification.payment = null;
  qualification.purchase_confirmed = !cancelled && (purchaseIntent || prior.purchase_confirmed === true);
  const ready = !!qualification.product && !!qualification.payment;
  const completesQualification = chat.status !== 'interesse em compra' && !!(product || payment || variant);
  const handoff = explicitHuman || (purchaseIntent && !cancelled && chat.status === 'interesse em compra') || (qualification.purchase_confirmed && ready && !browsing && (purchaseIntent || completesQualification));
  let message = response.message;
  if (purchaseIntent && !ready && !explicitHuman) {
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
