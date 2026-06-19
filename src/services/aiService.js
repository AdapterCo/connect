const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const cleanJsonString = require('../utils/cleanJson');
const Log = require('../models/Log');
const { decrypt } = require('../utils/crypto');
const catalogController = require('../controllers/catalogController');

const DEFAULT_AI_MODELS = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  groq: 'llama-3.3-70b-versatile'
};

function normalizeProvider(provider) {
  if (provider === 'grok') return 'groq';
  return provider || 'mock';
}

function normalizePaymentCopy(response) {
  if (!response || typeof response.message !== 'string') {
    return response;
  }

  response.message = response.message
    .replace(/Pagar pelo WhatsApp \(avise:/gi, 'Pagar pelo WhatsApp (aviso:')
    .replace(/(?:🔗\s*)?Link de pagamento \(o pedido só entra na fila após a confirmação do pagamento\)/gi, '💬 Pagar pelo WhatsApp (aviso: pedido só entra na fila após confirmação do pagamento)')
    .replace(/(?:🔗\s*)?Link de pagamento \(pedido só entra na fila após confirmação do pagamento\)/gi, '💬 Pagar pelo WhatsApp (aviso: pedido só entra na fila após confirmação do pagamento)')
    .replace(/🔗\s*Link de pagamento\s*\((?:avise|aviso):/gi, '💬 Pagar pelo WhatsApp (aviso:')
    .replace(/🔗\s*Link de pagamento\s*\(/gi, '💬 Pagar pelo WhatsApp (')
    .replace(/🔗\s*Link de pagamento/gi, '💬 Pagar pelo WhatsApp')
    .replace(/\n?📱\s*Pix na entrega/gi, '');

  return response;
}

async function runAiAttendant(chat, clientMessage, settings) {
  const provider = normalizeProvider(settings.ai_provider);
  const systemPrompt = settings.system_prompt;
  const companyId = chat.company_id || 'comp_default';

  const catalogCategories = await catalogController.getCatalogForAI(companyId);
  const catalogText = catalogController.formatCatalogForPrompt(catalogCategories);

  const historyText = chat.messages
    .slice(-10)
    .map(m => `${m.sender === 'client' ? 'Cliente' : 'Atendente'}: ${m.text}`)
    .join('\n');

  const fullPrompt = `${systemPrompt}\n\n${catalogText}\n\nHistórico da conversa atual:\n${historyText}\nCliente: ${clientMessage}\n\nINSTRUÇÕES IMPORTANTES:\n\n1. Se o cliente quiser fazer um PEDIDO (delivery, entrega, pedir comida, etc):\n   - Monte o carrinho com os itens do catálogo\n   - Pergunte a forma de pagamento com estas opções:\n     💰 Dinheiro na entrega\n     💳 Cartão na entrega\n     💬 Pagar pelo WhatsApp (aviso: pedido só entra na fila após confirmação do pagamento)\n   - Quando o cliente escolher pagamento presencial (dinheiro/cartão), retorne create_order: true\n   - Quando o cliente escolher pagar pelo WhatsApp ou pedir Pix, retorne trigger_billing: true e payment_method: "mercadopago"\n\n2. Se o cliente quiser comprar um SERVIÇO/PLANO via link:\n   - Retorne trigger_billing: true\n\nResponda estritamente com o JSON contendo:\n- "message": texto da resposta\n- "status": "iniciada" | "interesse em compra" | "finalizada"\n- "trigger_billing": boolean (gerar pagamento pelo WhatsApp)\n- "billing_item": nome do item/serviço\n- "billing_value": valor numérico\n- "create_order": boolean (criar pedido presencial)\n- "payment_method": "cash" | "card" | "mercadopago"\n- "order_items": array de { "product_name": string, "quantity": number, "variant_name": string|null, "addon_names": string[], "notes": string|null }\n- "delivery_address": string|null (endereço de entrega se fornecido)\n- "delivery_notes": string|null (observações gerais do pedido)`;

  const runMock = () => {
    const text = clientMessage.toLowerCase();
    let response = {
      message: "Entendi. Como posso ajudar você com mais alguma informação sobre nossos planos?",
      status: chat.status,
      trigger_billing: false,
      billing_item: "",
      billing_value: 0,
      create_order: false,
      payment_method: null,
      order_items: [],
      delivery_address: null,
      delivery_notes: null
    };

    if (text.includes("olá") || text.includes("oi") || text.includes("bom dia") || text.includes("boa tarde") || text.includes("boa noite")) {
      response.message = "Olá! Seja muito bem-vindo ao nosso atendimento virtual. Como posso ajudar você hoje?";
      response.status = "iniciada";
    } else if (text.includes("pizza") || text.includes("pedido") || text.includes("quero pedir") || text.includes("delivery") || text.includes("entrega")) {
      response.message = "🛒 *Seu Pedido:*\n• 1x Pizza Margherita - R$ 35,00\n*Total: R$ 35,00*\n\nComo deseja pagar?\n💰 Dinheiro na entrega\n💳 Cartão na entrega\n💬 Pagar pelo WhatsApp (aviso: pedido só entra na fila após confirmação do pagamento)";
      response.status = "interesse em compra";
    } else if (text.includes("dinheiro") || text.includes("cartão") || text.includes("pagar na entrega")) {
      const paymentMethod = text.includes("dinheiro") ? "cash" : "card";
      response.message = "✅ Pedido confirmado! Seu pedido foi enviado para produção.\nTempo estimado: 40-50 minutos.";
      response.status = "finalizada";
      response.create_order = true;
      response.payment_method = paymentMethod;
      response.order_items = [
        { product_name: "Pizza Margherita", quantity: 1, variant_name: null, addon_names: [], notes: null }
      ];
      response.delivery_address = "Rua Exemplo, 123";
      response.delivery_notes = null;
    } else if (text.includes("link") || text.includes("pagar online") || text.includes("pagar pelo whatsapp") || text.includes("pelo whatsapp") || text.includes("pix")) {
      response.message = "💳 Pagamento pelo WhatsApp gerado!\n*Valor: R$ 35,00*\n\n⏰ Após o pagamento ser confirmado, seu pedido entrará automaticamente na fila de produção.";
      response.status = "interesse em compra";
      response.trigger_billing = true;
      response.payment_method = "mercadopago";
      response.billing_item = "Pizza Margherita";
      response.billing_value = 35.00;
    } else if (text.includes("preço") || text.includes("valor") || text.includes("quanto custa") || text.includes("plano") || text.includes("assinar") || text.includes("comprar") || text.includes("contratar")) {
      response.message = "Nós oferecemos dois planos fantásticos! O Plano Pro por apenas R$ 97,00 mensais e o Plano Enterprise por R$ 197,00 mensais. Ambos contam com suporte completo e automação. Qual deles faz mais sentido para o seu negócio?";
      response.status = "interesse em compra";
    } else if (text.includes("quero fechar") || text.includes("vou assinar") || text.includes("gerar cobrança") || text.includes("pode cobrar") || text.includes("mandar o link") || text.includes("comprar agora")) {
      response.message = "Excelente escolha! Estou gerando o seu link de pagamento do Mercado Pago para finalizarmos a assinatura. Só um instante...";
      response.status = "interesse em compra";
      response.trigger_billing = true;
      response.billing_item = "Assinatura Plano Pro CRM";
      response.billing_value = 97.00;
    } else if (text.includes("desconto") || text.includes("anual")) {
      response.message = "Com certeza! Para o plano anual Pro, temos um desconto especial: sai por apenas R$ 997,00 ao ano (uma economia incrível). Deseja fechar este plano?";
      response.status = "interesse em compra";
    }
    return response;
  };

  if (provider === 'mock') {
    return normalizePaymentCopy(runMock());
  }

  const geminiKey = settings.gemini_key ? decrypt(settings.gemini_key) : '';
  const openaiKey = settings.openai_key ? decrypt(settings.openai_key) : '';
  const groqKey = settings.grok_key ? decrypt(settings.grok_key) : '';

  if (provider === 'gemini' && !geminiKey) {
    throw new Error('Chave de API do Gemini não configurada.');
  }
  if (provider === 'openai' && !openaiKey) {
    throw new Error('Chave de API da OpenAI não configurada.');
  }
  if (provider === 'groq' && !groqKey) {
    throw new Error('Chave de API da Groq não configurada.');
  }

  if (provider === 'gemini') {
    const primaryModel = settings.gemini_model || DEFAULT_AI_MODELS.gemini;
    const fallbackModel = primaryModel === DEFAULT_AI_MODELS.gemini ? "gemini-2.0-flash" : DEFAULT_AI_MODELS.gemini;
    const genAI = new GoogleGenerativeAI(geminiKey);
    
    const attemptContentGeneration = async (modelName) => {
      let delayMs = 1000;
      const retries = 3;
      let lastErr;
      
      for (let i = 0; i < retries; i++) {
        try {
          const model = genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig: { responseMimeType: "application/json" }
          }, { apiVersion: 'v1beta' });
          const result = await model.generateContent(fullPrompt);
          const responseText = result.response.text();
          return normalizePaymentCopy(JSON.parse(cleanJsonString(responseText)));
        } catch (err) {
          lastErr = err;
          const errMsg = err.message || '';
          const isTransient = errMsg.includes('503') || errMsg.includes('429') || errMsg.includes('demand') || errMsg.includes('temporary');
          
          if (isTransient && i < retries - 1) {
            await Log.add(`[Aviso Gemini] Modelo ${modelName} sob alta demanda. Retentando em ${delayMs/1000}s...`, companyId);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            delayMs *= 2;
          } else {
            throw err;
          }
        }
      }
      throw lastErr;
    };

    try {
      return await attemptContentGeneration(primaryModel);
    } catch (primaryErr) {
      await Log.add(`[Aviso Gemini] Falha no modelo primário ${primaryModel}. Alternando para ${fallbackModel}...`, companyId);
      try {
        return await attemptContentGeneration(fallbackModel);
      } catch (fallbackErr) {
        throw primaryErr;
      }
    }
  } 

  if (provider === 'openai') {
    const modelName = settings.openai_model || DEFAULT_AI_MODELS.openai;
    // [A4] Timeout de 30s para evitar DoS por hold de resposta
    const openai = new OpenAI({ apiKey: openaiKey, timeout: 30_000, maxRetries: 2 });
    const completion = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: fullPrompt },
        { role: "user", content: clientMessage }
      ],
      response_format: { type: "json_object" }
    });
    const responseText = completion.choices[0].message.content;
    return normalizePaymentCopy(JSON.parse(cleanJsonString(responseText)));
  }

  if (provider === 'groq') {
    const modelName = settings.grok_model || DEFAULT_AI_MODELS.groq;
    const groq = new OpenAI({
      apiKey: groqKey,
      baseURL: 'https://api.groq.com/openai/v1',
      timeout: 30_000,
      maxRetries: 2
    });
    const completion = await groq.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: fullPrompt },
        { role: "user", content: clientMessage }
      ],
      response_format: { type: "json_object" }
    });
    const responseText = completion.choices?.[0]?.message?.content;
    if (!responseText) {
      throw new Error('Formato de resposta da API da Groq inválido ou vazio.');
    }

    return normalizePaymentCopy(JSON.parse(cleanJsonString(responseText)));
  }
}

module.exports = {
  runAiAttendant
};
