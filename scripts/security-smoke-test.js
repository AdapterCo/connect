const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Garantir que o smoke-test nao ative validacoes fatais de producao
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-test-jwt-secret-32-chars-ok';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'smoke-test-enc-key-32-chars-00000';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';

const { encrypt, decrypt } = require('../src/utils/crypto');

const encrypted = encrypt('APP_USR-test-token');
assert.notStrictEqual(encrypted, 'APP_USR-test-token');
assert.strictEqual(decrypt(encrypted), 'APP_USR-test-token');

// Pagamentos sao confirmados somente por consulta a API do Mercado Pago:
// nenhuma rota pode aceitar status de pagamento enviado de fora.
const billingRoutes = fs.readFileSync(path.join(__dirname, '../src/routes/billingRoutes.js'), 'utf8');
const billingService = fs.readFileSync(path.join(__dirname, '../src/services/billingService.js'), 'utf8');
assert(!/router\.\w+\([^)]*webhook/i.test(billingRoutes), 'Billing nao deve expor rota de webhook');
assert(!billingService.includes('notification_url'), 'Pagamentos nao devem registrar notification_url');

// Seed nao pode criar contas com senha fixa no codigo.
const database = fs.readFileSync(path.join(__dirname, '../src/config/database.js'), 'utf8');
assert(!/bcrypt\.hash\(\s*'[^']+'/.test(database), 'Seed nao deve usar senha literal');

const aiService = fs.readFileSync(path.join(__dirname, '../src/services/aiService.js'), 'utf8');
assert(!aiService.includes('📱 Pix na entrega\\n'), 'Pix na entrega nao deve ser ofertado');
assert(!aiService.includes('Pagar pelo WhatsApp (avise:'), 'Texto exibido deve usar aviso, nao avise');
assert(aiService.includes('normalizePaymentCopy'), 'Resposta da IA deve ser normalizada antes do envio');

const dockerfile = fs.readFileSync(path.join(__dirname, '../Dockerfile'), 'utf8');
const entrypoint = fs.readFileSync(path.join(__dirname, './docker-entrypoint.sh'), 'utf8');
assert(dockerfile.includes('ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]'), 'Container deve usar entrypoint de hardening');
assert(entrypoint.includes('su node'), 'Entrypoint deve derrubar privilegios para usuario node');
// [U3] Verificar que Dockerfile nao usa USER root
assert(!dockerfile.includes('USER root'), 'Dockerfile NAO deve declarar USER root — use USER node');
assert(dockerfile.includes('USER node'), 'Dockerfile deve declarar USER node antes do ENTRYPOINT');

console.log('Security smoke test passed.');
