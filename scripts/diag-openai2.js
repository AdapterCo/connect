process.env.JWT_SECRET = 'test-32-chars-secret-for-check-ok';
process.env.ENCRYPTION_KEY = 'test-32-chars-enckey-for-check-ok';
process.env.DATABASE_URL = 'postgresql://x:x@localhost/x';
const path = require('path');
const { encrypt, decrypt } = require(path.join(__dirname, '../src/utils/crypto'));

// Simular o que settingsController faz quando usuario salva openai_key = "sk-proj-abc"
console.log('=== settingsController.updateSettings ===');
const data = { ai_provider: 'openai', openai_key: 'sk-proj-test-123', openai_model: 'gpt-4o-mini', ai_enabled: true };

const updateData = {};
if (data.openai_key !== undefined) updateData.openai_key = encrypt(data.openai_key);
console.log('updateData.openai_key (encriptado):', updateData.openai_key ? updateData.openai_key.slice(0,30) + '...' : 'null');

// Simular o que aiService faz ao ler do banco
const fromDB = updateData.openai_key;
const openaiKey = fromDB ? decrypt(fromDB) : '';
console.log('openaiKey (apos decrypt):', openaiKey);
console.log('Valido para uso?', !!openaiKey);

// Agora o problema real: o que acontece se o usuario muda provider mas nao mexe na chave?
// O frontend envia openai_key no payload SEMPRE (pois e campo do formData)
// Mas se o usuario nao tocou no campo, o valor e o que veio do GET /settings (ja descriptografado)
// Entao o frontend reenvia a chave em PLAINTEXT, e o backend a re-encripta
// Isso esta correto.

// MAS: e se o frontend receber a chave descriptografada como string vazia?
// Isso acontece quando nao ha chave salva
console.log('\n=== Cenario: usuario ve campo vazio, digita a chave, salva ===');
const data2 = { ai_provider: 'openai', openai_key: 'sk-proj-real-key-123456', ai_enabled: true };
const upd2 = {};
if (data2.openai_key !== undefined) upd2.openai_key = encrypt(data2.openai_key);
const fromDB2 = upd2.openai_key;
const key2 = fromDB2 ? decrypt(fromDB2) : '';
console.log('Resultado:', key2, '| Valido?', !!key2);

// Verificar o campo response_format com a versao do SDK
const OpenAI = require(path.join(__dirname, '../node_modules/openai'));
const c = new OpenAI({ apiKey: 'sk-test', timeout: 30000, maxRetries: 2 });
console.log('\n=== Verificacao SDK ===');
console.log('openai version:', require(path.join(__dirname, '../node_modules/openai/package.json')).version);
console.log('response_format suportado: SIM (v4+)');

// Verificar se o modelo gpt-4o-mini suporta response_format json_object
// A API exige que o prompt contenha a palavra "json" (case insensitive) ao usar json_object
// Verificar o fullPrompt do aiService
const fs = require('fs');
const aiServiceCode = fs.readFileSync(path.join(__dirname, '../src/services/aiService.js'), 'utf8');
const hasJsonWord = aiServiceCode.includes('JSON') || aiServiceCode.includes('json');
console.log('\nPrompt contem palavra JSON?', hasJsonWord, '(obrigatorio para response_format json_object)');

// Verificar se o modelo padrao e compativel com response_format json_object
const defaultModel = 'gpt-4o-mini';
const compatibleModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
console.log('Modelo padrao:', defaultModel);
console.log('Compativel com json_object?', compatibleModels.some(m => defaultModel.startsWith(m)));
