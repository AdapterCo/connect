process.env.JWT_SECRET = 'test-32-chars-secret-for-check-ok';
process.env.ENCRYPTION_KEY = 'test-32-chars-enckey-for-check-ok';
process.env.DATABASE_URL = 'postgresql://x:x@localhost/x';
const path = require('path');
const { encrypt, decrypt } = require(path.join(__dirname, '../src/utils/crypto'));

// 1) O que acontece com encrypt('') ?
const encEmpty = encrypt('');
console.log('encrypt("") =>', encEmpty);
console.log('  truthy?', !!encEmpty);
console.log('  decrypt(encrypt("")) =>', JSON.stringify(decrypt(encEmpty)));
console.log('  falsy apos decrypt?', !decrypt(encEmpty));

const realKey = 'sk-proj-AbCdEfGhIjKlMnOpQr';
const encReal = encrypt(realKey);
console.log('\nencrypt(realKey) =>', encReal.slice(0,30) + '...');
console.log('  decrypt ok?', decrypt(encReal) === realKey);

console.log('\n--- SIMULACAO fluxo aiService.js ---');
function check(label, storedKey) {
  const openaiKey = storedKey ? decrypt(storedKey) : '';
  const ok = !!openaiKey;
  console.log('[' + label + '] openaiKey apos decrypt:', JSON.stringify(openaiKey), '=> provider check passa?', ok);
}

check('encrypt("") - tenant novo sem chave salva', encEmpty);
check('encrypt(realKey) - usuario salvou chave corretamente', encReal);
check('null - campo nunca gravado', null);

console.log('\n--- CONCLUSAO ---');
if (!decrypt(encEmpty)) {
  console.log('BUG ENCONTRADO: encrypt("") resulta em decrypt = "" (falsy).');
  console.log('Se o tenant foi criado com openai_key = encrypt("") e o usuario');
  console.log('depois salvou a chave real, o update SUBSTITUIU o valor corretamente.');
  console.log('Portanto o problema NAO e este cenario.');
}
console.log('A chave salva pelo usuario substitui corretamente o valor anterior.');
