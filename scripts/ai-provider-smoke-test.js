const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const aiService = read('src/services/aiService.js');
const settingsController = read('src/controllers/settingsController.js');
const reactSettings = read('frontend/src/pages/SettingsAI.tsx');
const legacyHtml = read('public/index.html');
const legacyApp = read('public/js/app.js');
const migration = read('prisma/migrations/20260619120000_rename_grok_provider_to_groq/migration.sql');

assert(aiService.includes("const OpenAI = require('openai')"), 'OpenAI SDK deve estar carregado');
assert(aiService.includes("provider === 'openai'"), 'Provider OpenAI deve existir');
assert(aiService.includes("openai.chat.completions.create"), 'OpenAI deve usar Chat Completions');
assert(aiService.includes("provider === 'groq'"), 'Provider Groq deve existir');
assert(aiService.includes("baseURL: 'https://api.groq.com/openai/v1'"), 'Groq deve usar endpoint compativel com OpenAI');
assert(aiService.includes('llama-3.3-70b-versatile'), 'Groq deve ter modelo padrao de producao');
assert(!aiService.includes(['https://api', 'x', 'ai'].join('.')), 'Endpoint legado nao deve permanecer no servico de IA');
assert(!aiService.includes(['Erro na API do', 'Gr' + 'ok'].join(' ')), 'Mensagens de erro nao devem referenciar provider legado');

assert(settingsController.includes("if (provider === 'grok') return 'groq'"), 'Backend deve migrar provider legado grok para groq');
assert(settingsController.includes('groq_key'), 'Backend deve aceitar alias groq_key');
assert(settingsController.includes('groq_model'), 'Backend deve aceitar alias groq_model');

assert(reactSettings.includes('<option value="groq">Groq</option>'), 'Frontend React deve exibir Groq');
assert(!reactSettings.includes('<option value="grok">'), 'Frontend React nao deve oferecer provider legado');
assert(!reactSettings.includes(['x' + 'AI', 'Gr' + 'ok'].join(' ')), 'Frontend React nao deve mencionar provider legado');

assert(legacyHtml.includes('<option value="groq">Groq'), 'Tela estatica deve exibir Groq');
assert(!legacyHtml.includes(['<option value="grok">', 'x' + 'AI'].join('')), 'Tela estatica nao deve oferecer provider legado');
assert(legacyApp.includes("provider === 'groq'"), 'JS legado deve tratar provider Groq');

assert(migration.includes("SET \"ai_provider\" = 'groq'"), 'Migracao deve converter provider para groq');
assert(migration.includes("WHERE \"ai_provider\" = 'grok'"), 'Migracao deve localizar registros legados grok');

console.log('AI provider smoke test passed.');
