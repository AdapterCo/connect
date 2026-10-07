const https = require('node:https');
const dns = require('node:dns');
const { BlockList, isIP } = require('node:net');
const blocked = new BlockList();
for (const [ip, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['192.0.0.0', 24], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]]) blocked.addSubnet(ip, prefix);
function validateUrl(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048) throw Object.assign(new Error('URL da foto inválida.'), { status: 400 });
  let url;
  try { url = new URL(value); } catch { throw Object.assign(new Error('URL da foto inválida.'), { status: 400 }); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hostname.includes(':') || url.hostname === 'localhost' || (isIP(url.hostname) && (isIP(url.hostname) !== 4 || blocked.check(url.hostname)))) {
    throw Object.assign(new Error('Use uma URL HTTPS pública para a foto.'), { status: 400 });
  }
  return url.href;
}
function download(value) {
  const url = validateUrl(value);
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      // Resolve and validate the actual address used for this connection. No redirects.
      lookup(host, options, callback) {
        dns.lookup(host, { family: 4 }, (error, address) => {
          if (error) return callback(error);
          if (blocked.check(address)) return callback(new Error('Endereço privado bloqueado.'));
          callback(null, options.all ? [{ address, family: 4 }] : address, options.all ? undefined : 4);
        });
      }
    }, response => {
      const mime = String(response.headers['content-type'] || '').split(';')[0];
      if (response.statusCode !== 200 || !['image/jpeg', 'image/png'].includes(mime)) {
        response.resume(); request.destroy(new Error('Foto precisa ser um JPEG ou PNG acessível diretamente.')); return;
      }
      let size = 0; const chunks = [];
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 5 * 1024 * 1024) request.destroy(new Error('Foto excede 5 MB.'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const valid = mime === 'image/jpeg' ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 : buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        if (!valid || size > 5 * 1024 * 1024) reject(new Error('Conteúdo da foto inválido.'));
        else resolve(buffer);
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('Tempo de download da foto excedido.')), 10000);
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
  });
}
const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function select(models, input, reply) {
  const message = ` ${normalize(input)} `, answer = ` ${normalize(reply)} `;
  const catalog = /\b(catalogo|produtos|motos|celulares|listas?|iphones|telefones|aparelhos)\b/.test(message);
  const matching = models.filter(model => model.is_active && model.image_url && answer.includes(` ${normalize(model.name)} `));
  const named = matching.filter(model => message.includes(` ${normalize(model.name)} `));
  // Prefer the most specific model name (iPhone 13 Pro rather than iPhone 13).
  return catalog ? matching : named.filter(model => !named.some(other => other.name !== model.name && normalize(other.name).includes(normalize(model.name))));
}
module.exports = { validateUrl, download, select };
