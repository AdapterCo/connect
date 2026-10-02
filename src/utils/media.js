const path = require('path');
const { UPLOAD_DIR } = require('../config/index');
function mediaPath(url) {
  if (typeof url !== 'string' || !/^\/uploads\/(?:[a-zA-Z0-9_-]+)\.(?:jpg|jpeg|png|gif|webp|mp4|mov|m4a|mp3|ogg|wav|pdf|txt|doc|docx|xls|xlsx)$/.test(url)) throw new Error('Arquivo de midia invalido.');
  return path.join(UPLOAD_DIR, path.basename(url));
}
function ownerPrefix(user) { return require('crypto').createHash('sha256').update(user.company_id + ':' + user.id).digest('hex').slice(0, 24); }
async function canAccessMedia(user, url) {
  mediaPath(url);
  if (path.basename(url).startsWith(ownerPrefix(user) + '_')) return true;
  const { prisma } = require('../config/database');
  const where = { ...await require('../services/accessService').chatScope(user), messages: { some: { media_url: url } } };
  return !!(await prisma.chat.findFirst({ where, select: { id: true } }));
}
// Remove do disco as midias de uma conversa (LGPD: anonimizar/excluir o cliente
// nao pode deixar os arquivos para tras). Arquivos tambem usados em outra
// conversa sao preservados. Chamar ANTES de apagar as mensagens do banco.
async function removeChatMedia(chatId) {
  const { prisma } = require('../config/database');
  const messages = await prisma.message.findMany({ where: { chat_id: chatId, media_url: { not: null } }, select: { media_url: true } });
  const urls = [...new Set(messages.map(m => m.media_url).filter(Boolean))];
  let removed = 0;
  for (const url of urls) {
    let file;
    try { file = mediaPath(url); } catch { continue; }
    const sharedElsewhere = await prisma.message.findFirst({ where: { media_url: url, chat_id: { not: chatId } }, select: { id: true } });
    if (sharedElsewhere) continue;
    try {
      await require('fs').promises.unlink(file);
      removed++;
    } catch (error) {
      if (error.code !== 'ENOENT') console.error('Falha ao remover midia:', error.code || error.name);
    }
  }
  return removed;
}

module.exports = { mediaPath, ownerPrefix, canAccessMedia, removeChatMedia };
