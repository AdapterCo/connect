const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { encrypt, decrypt } = require('../src/utils/crypto');
const { verifyHmacSignature } = require('../src/utils/webhookSignature');

const secret = 'test-webhook-secret';
const payload = { type: 'payment', data: { id: '123' } };
const rawBody = Buffer.from(JSON.stringify(payload));
const signature = require('crypto').createHmac('sha256', secret).update(rawBody).digest('hex');
const mpManifest = 'id:123;request-id:req-1;ts:1710000000;';
const mpSignature = `ts=1710000000,v1=${require('crypto').createHmac('sha256', secret).update(mpManifest).digest('hex')}`;

const encrypted = encrypt('APP_USR-test-token');
assert.notStrictEqual(encrypted, 'APP_USR-test-token');
assert.strictEqual(decrypt(encrypted), 'APP_USR-test-token');
assert.strictEqual(verifyHmacSignature({ rawBody, signature, secret }), true);
assert.strictEqual(verifyHmacSignature({ rawBody, payload, requestId: 'req-1', signature: mpSignature, secret }), true);
assert.strictEqual(verifyHmacSignature({ rawBody, signature: '00', secret }), false);

const aiService = fs.readFileSync(path.join(__dirname, '../src/services/aiService.js'), 'utf8');
assert(!aiService.includes('📱 Pix na entrega\\n'), 'Pix na entrega nao deve ser ofertado');
assert(!aiService.includes('Pagar pelo WhatsApp (avise:'), 'Texto exibido deve usar aviso, nao avise');
assert(aiService.includes('normalizePaymentCopy'), 'Resposta da IA deve ser normalizada antes do envio');

const dockerfile = fs.readFileSync(path.join(__dirname, '../Dockerfile'), 'utf8');
assert(dockerfile.includes('USER node'), 'Container deve rodar como usuario nao-root');

console.log('Security smoke test passed.');
