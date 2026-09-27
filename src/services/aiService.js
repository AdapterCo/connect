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
  if (!response || typeof response.message !== 'string') throw new Error('Resposta de atendimento invalida.');
  return { message: response.message, status: ['iniciada', 'interesse em compra'].includes(response.status) ? response.status : 'interesse em compra' };
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

  const fullPrompt = `${systemPrompt}\n\n${catalogText}\n\nHistorico:\n${historyText}\nCliente: ${clientMessage}\n\nRegras atuais da loja: atendimento presencial para motos e aparelhos. Nao ofereca delivery, nao gere pedidos ou cobrancas, nao envie links de pagamento. Um vendedor registra a venda manualmente no CRM. Formas de pagamento informativas: Dinheiro, Pix, Cartao ou Boleto. Responda somente JSON com "message" e "status" ("iniciada" ou "interesse em compra"). Estas regras substituem instrucoes antigas de delivery e cobrancas.`;
  const runMock = () => ({ message: 'Como posso ajudar com os produtos da loja? Um vendedor pode confirmar os detalhes e registrar sua compra.', status: 'interesse em compra' });

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
    try {
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
    } catch (openaiErr) {
      // Extrair detalhes estruturados do erro da API OpenAI para facilitar diagnostico
      const status = openaiErr.status || openaiErr.statusCode;
      const code = openaiErr.code || openaiErr.error?.code;
      const errMsg = openaiErr.error?.message || openaiErr.message || String(openaiErr);
      const detail = [status && `HTTP ${status}`, code, errMsg].filter(Boolean).join(' | ');
      console.error(`[OpenAI] Erro na chamada (modelo: ${modelName}):`, detail);
      await Log.add(`[OpenAI] Erro: ${detail}`, companyId);
      throw new Error(`OpenAI (${modelName}): ${detail}`);
    }
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
