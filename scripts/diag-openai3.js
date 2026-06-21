process.env.JWT_SECRET = 'test-32-chars-secret-for-check-ok';
process.env.ENCRYPTION_KEY = 'test-32-chars-enckey-for-check-ok';
process.env.DATABASE_URL = 'postgresql://x:x@localhost/x';
const path = require('path');
const { encrypt, decrypt } = require(path.join(__dirname, '../src/utils/crypto'));

// Replicar EXATAMENTE a logica do settingsController.updateSettings
function normalizeProvider(p) {
  if (p === 'grok') return 'groq';
  return p || 'mock';
}

function simulateUpdate(data) {
  const aiProvider = data.ai_provider !== undefined ? normalizeProvider(data.ai_provider) : undefined;
  const groqKey = data.groq_key !== undefined ? data.groq_key : data.grok_key;
  const groqModel = data.groq_model !== undefined ? data.groq_model : data.grok_model;

  const updateData = {
    ai_enabled: data.ai_enabled !== undefined ? data.ai_enabled : undefined,
    ai_provider: aiProvider,
    gemini_model: data.gemini_model !== undefined ? data.gemini_model : undefined,
    openai_model: data.openai_model !== undefined ? data.openai_model : undefined,
    grok_model: groqModel !== undefined ? groqModel : undefined,
    system_prompt: data.system_prompt !== undefined ? data.system_prompt : undefined
  };

  if (data.gemini_key !== undefined) updateData.gemini_key = encrypt(data.gemini_key);
  if (data.openai_key !== undefined) updateData.openai_key = encrypt(data.openai_key);
  if (groqKey !== undefined) updateData.grok_key = encrypt(groqKey);

  return updateData;
}

// Payload exato que o frontend envia ao salvar com OpenAI
const frontendPayload = {
  ai_enabled: true,
  ai_provider: 'openai',
  gemini_key: '',
  openai_key: 'sk-proj-MyRealKeyHere123456',
  groq_key: '',
  gemini_model: 'gemini-2.5-flash',
  openai_model: 'gpt-4o-mini',
  groq_model: 'llama-3.3-70b-versatile',
  system_prompt: 'Voce e um assistente...',
  grok_key: '',
  grok_model: 'llama-3.3-70b-versatile'
};

const result = simulateUpdate(frontendPayload);
console.log('=== Resultado do updateData ===');
console.log('ai_provider:', result.ai_provider);
console.log('ai_enabled:', result.ai_enabled);
console.log('openai_model:', result.openai_model);
console.log('openai_key (encriptado):', result.openai_key ? result.openai_key.slice(0,35) + '...' : 'null/undefined');

// O que o aiService vai ler do banco?
const storedKey = result.openai_key;
const decryptedBack = storedKey ? decrypt(storedKey) : '';
console.log('\n=== Simulacao aiService lendo do banco ===');
console.log('openaiKey (decryptado):', decryptedBack);
console.log('Passa verificacao!openaiKey?', !!decryptedBack);
console.log('provider correto?', result.ai_provider === 'openai');

// Verificar caso especifico: gemini_key = '' - o que acontece?
console.log('\n=== Efeito colateral: gemini_key = "" ===');
console.log('encrypt("") retorna:', encrypt(''));
console.log('Entao quando usuario salva com openai, gemini_key no banco fica:', 
  encrypt('') === null ? 'null (OK, campo limpo)' : 'valor encriptado');

console.log('\n=== DIAGNOSTICO FINAL ===');
if (result.ai_provider === 'openai' && decryptedBack) {
  console.log('OK: Fluxo backend esta CORRETO.');
  console.log('Se o OpenAI nao funciona, o problema e externo ao codigo:');
  console.log('  1. Chave de API invalida ou expirada');
  console.log('  2. Conta OpenAI sem saldo/creditos');
  console.log('  3. Modelo gpt-4o-mini indisponivel na conta');
  console.log('  4. Rate limit / quota excedida');
  console.log('  5. Erro de rede do servidor para api.openai.com');
} else {
  console.log('PROBLEMA encontrado no fluxo!');
}
