const { prisma } = require('../config/database');
const { companyActive } = require('./accessService');
const { mediaPath } = require('../utils/media');
async function checkScheduledMessages() {
  const now = new Date();
  // Claims interrompidos por restart voltam a fila; envio externo pode ser repetido.
  await prisma.scheduledMessage.updateMany({ where: { status: 'processing', locked_at: { lt: new Date(now - 5 * 60000) } }, data: { status: 'pending', locked_at: null } });
  const pending = await prisma.scheduledMessage.findMany({ where: { status: 'pending', scheduledTime: { lte: now }, next_attempt_at: { lte: now } }, take: 50, orderBy: { scheduledTime: 'asc' } });
  for (const sch of pending) {
    const claimed = await prisma.scheduledMessage.updateMany({ where: { id: sch.id, status: 'pending' }, data: { status: 'processing', locked_at: now, attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    try {
      const company = await prisma.company.findUnique({ where: { id: sch.company_id } });
      const chat = await prisma.chat.findFirst({ where: { id: sch.chat_id, company_id: sch.company_id } });
      if (!chat || chat.is_blocked || chat.is_archived) throw Object.assign(new Error('Conversa indisponivel.'), { terminal: true });
      if (!companyActive(company)) throw new Error('Empresa inativa.');
      const content = sch.media_url ? { [sch.media_type]: { url: mediaPath(sch.media_url) }, ...(sch.media_type === 'audio' ? { mimetype: 'audio/mp4', ptt: true } : sch.media_type === 'document' ? { fileName: sch.file_name || 'Arquivo' } : { caption: sch.text || undefined }) } : { text: sch.text };
      const result = await require('./whatsappService').sendMessage(chat.instance_id, require('../models/Chat').getRemoteJid(chat), content);
      if (!result) throw new Error('WhatsApp desconectado.');
      await prisma.$transaction(async tx => {
        await tx.scheduledMessage.update({ where: { id: sch.id }, data: { status: 'sent', sent_at: new Date(), locked_at: null, last_error: null } });
        await tx.message.create({ data: { id: 'scheduled-' + sch.id, chat_id: chat.id, sender: 'attendant', text: sch.text || '', is_scheduled: true, media_url: sch.media_url, media_type: sch.media_type, file_name: sch.file_name } });
      });
      try {
        require('../config/socket').emitToCompany(sch.company_id, 'chat_updated', await require('../models/Chat').findById(chat.id, sch.company_id));
      } catch (error) { console.error('[Scheduler notification]', error.code || error.name); }
    } catch (error) {
      const attempts = (sch.attempts || 0) + 1;
      await prisma.scheduledMessage.update({ where: { id: sch.id }, data: { status: error.terminal || attempts >= 10 ? 'failed' : 'pending', locked_at: null, last_error: error.terminal ? 'Conversa indisponivel.' : 'Envio nao confirmado. Nova tentativa programada.', next_attempt_at: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** attempts)) } });
    }
  }
}
module.exports = { checkScheduledMessages };
