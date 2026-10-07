const test = require('node:test');
const assert = require('node:assert/strict');
const { validateUrl, select } = require('../src/services/productPhotoService');
const models = [
  { name: 'Moto Future', image_url: 'https://example.com/a.jpg', is_active: true },
  { name: 'iPhone 13', image_url: 'https://example.com/b.jpg', is_active: true },
  { name: 'iPhone 13 Pro', image_url: 'https://example.com/c.jpg', is_active: true },
  { name: 'Moto Fantom', image_url: 'https://example.com/d.jpg', is_active: false }
];
test('catalog images only supplement products present in the attendant response', () => {
  assert.deepEqual(select(models, 'me manda o catálogo', 'Temos Moto Future e Moto Fantom.'), [models[0]]);
  assert.deepEqual(select(models, 'lista de aparelhos', 'iPhone 13 e iPhone 13 Pro'), [models[1], models[2]]);
  assert.deepEqual(select(models, 'olá', 'Moto Future'), []);
});
test('selected models use the specific name and never match unrelated products', () => {
  assert.deepEqual(select(models, 'foto do iPhone 13 Pro', 'iPhone 13 Pro'), [models[2]]);
  assert.deepEqual(select(models, 'Moto Future', 'Moto Future'), [models[0]]);
  assert.deepEqual(select(models, 'Moto Future', 'Seu atendimento está encaminhado'), []);
});
test('photo URL rejects credentials, non-HTTPS and internal literal addresses', () => {
  assert.equal(validateUrl(''), null);
  assert.equal(validateUrl('https://example.com/photo.jpg'), 'https://example.com/photo.jpg');
  for (const url of ['http://example.com/a.jpg', 'https://localhost/a', 'https://127.0.0.1/a', 'https://10.0.0.1/a', 'https://[::1]/a', 'https://user:pass@example.com/a', 'https://example.com:8080/a']) assert.throws(() => validateUrl(url));
});
