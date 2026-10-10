const fs = require('fs');
function validContent(buffer, mime) {
  const hex = buffer.subarray(0, 12).toString('hex');
  const text = buffer.subarray(0, 16).toString('ascii');
  switch (mime) {
    case 'image/jpeg': return hex.startsWith('ffd8ff');
    case 'image/png': return hex.startsWith('89504e470d0a1a0a');
    case 'image/gif': return /^GIF8[79]a/.test(text);
    case 'image/webp': return text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP';
    case 'audio/wav': return text.startsWith('RIFF') && text.slice(8, 12) === 'WAVE';
    case 'audio/ogg': return text.startsWith('OggS');
    case 'audio/mpeg': return text.startsWith('ID3') || (buffer[0] === 255 && (buffer[1] & 224) === 224);
    case 'video/mp4': case 'video/quicktime': case 'audio/mp4': return text.slice(4, 8) === 'ftyp';
    case 'application/pdf': return text.startsWith('%PDF-');
    case 'application/msword': case 'application/vnd.ms-excel': return hex.startsWith('d0cf11e0a1b11ae1');
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': return hex.startsWith('504b0304');
    case 'text/plain': return buffer.length > 0 && !buffer.includes(0) && !buffer.toString('utf8').includes('\ufffd');
    default: return false;
  }
}
async function validateUpload(req, res, next) {
  if (!req.file) return next();
  try {
    const buffer = await fs.promises.readFile(req.file.path);
    if (!validContent(buffer, req.file.mimetype)) throw new Error('Conteudo do arquivo nao corresponde ao tipo informado.');
    await require('../services/mediaStorageService').withMediaLock(req.user.company_id, () => require('../services/mediaStorageService').checkQuota(req.user.company_id, req.file.size, { stored: true }));
    next();
  } catch (error) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    res.status(error.status || 400).json({ error: error.status === 413 ? error.message : 'Arquivo invalido ou formato nao reconhecido.' });
  }
}
module.exports = { validContent, validateUpload };
