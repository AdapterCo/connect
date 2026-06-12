const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const cleanJsonString = require('../utils/cleanJson');
const Log = require('../models/Log');
const { decrypt } = require('../utils/crypto');
const catalogController = require('../controllers/catalogController');

async function runAiAttendant(chat, clientMessage, settings) {
  const provider = settings.ai_provider || 'mock';
  const systemPrompt = settings.system_prompt;
  const companyId = chat.company_id || 'comp_default';

  const catalogCategories = await catalogController.getCatalogForAI(companyId);
  const catalogText = catalogController.formatCatalogForPrompt(catalogCategories);

  const historyText = chat.messages
    .slice(-10)
    .map(m => `${m.sender === 'client' ? 'Cliente' : 'Atendente'}: ${m.text}`)
    .join('\n');

  const fullPrompt = `${systemPrompt}\n\n${catalogText}\n\nHistórico da conversa atual:\n${historyText}\nCliente: ${clientMessage}\n\nResponda estritamente com o JSON contendo "message", "status", "trigger_billing", "billing_item", "billing_value":`;

  const runMock = () => {
    const text = clientMessage.toLowerCase();
    let response = {
      message: "Entendi. Como posso ajudar você com mais alguma informação sobre nossos planos?",
      status: chat.status,
      trigger_billing: false,
      billing_item: "",
      billing_value: 0
    };

    if (text.includes("olá") || text.includes("oi") || text.includes("bom dia") || text.includes("boa tarde") || text.includes("boa noite")) {
      response.message = "Olá! Seja muito bem-vindo ao nosso atendimento virtual. Como posso ajudar você hoje?";
      response.status = "iniciada";
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
    return runMock();
  }

  const geminiKey = settings.gemini_key ? decrypt(settings.gemini_key) : '';
  const openaiKey = settings.openai_key ? decrypt(settings.openai_key) : '';
  const grokKey = settings.grok_key ? decrypt(settings.grok_key) : '';

  if (provider === 'gemini' && !geminiKey) {
    throw new Error('Chave de API do Gemini não configurada.');
  }
  if (provider === 'openai' && !openaiKey) {
    throw new Error('Chave de API da OpenAI não configurada.');
  }
  if (provider === 'grok' && !grokKey) {
    throw new Error('Chave de API da xAI (Grok) não configurada.');
  }

  if (provider === 'gemini') {
    const primaryModel = settings.gemini_model || "gemini-2.5-flash";
    const fallbackModel = primaryModel === "gemini-2.5-flash" ? "gemini-2.0-flash" : "gemini-2.5-flash";
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
          });
          const result = await model.generateContent(fullPrompt);
          const responseText = result.response.text();
          return JSON.parse(cleanJsonString(responseText));
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
    const modelName = settings.openai_model || "gpt-4o-mini";
    const openai = new OpenAI({ apiKey: openaiKey });
    const completion = await openai.chat.completions.create({
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Histórico da conversa:\n${historyText}\n\nCliente: ${clientMessage}\n\nResponda apenas em formato JSON.` }
      ],
      response_format: { type: "json_object" }
    });
    const responseText = completion.choices[0].message.content;
    return JSON.parse(cleanJsonString(responseText));
  }

  if (provider === 'grok') {
    const modelName = settings.grok_model || "grok-4.3";

    const input = [
      { role: "system", content: systemPrompt }
    ];

    chat.messages.slice(-10).forEach(m => {
      let role = 'user';
      if (m.sender === 'attendant') role = 'assistant';
      if (m.sender === 'system') role = 'assistant';
      
      input.push({
        role: role,
        content: m.text
      });
    });

    input.push({
      role: "user",
      content: clientMessage
    });

    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${grokKey}`
      },
      body: JSON.stringify({
        model: modelName,
        input: input
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      let parseErr;
      try {
        parseErr = JSON.parse(errText);
      } catch (e) {}
      const errMsg = parseErr?.error || parseErr?.message || errText;
      throw new Error(`Erro na API do Grok: ${response.status} - ${typeof errMsg === 'object' ? JSON.stringify(errMsg) : errMsg}`);
    }

    const resData = await response.json();
    const responseText = resData.output?.[0]?.content?.[0]?.text;
    if (!responseText) {
      throw new Error('Formato de resposta da API do Grok inválido ou vazio.');
    }

    return JSON.parse(cleanJsonString(responseText));
  }
}

module.exports = {
  runAiAttendant
};
