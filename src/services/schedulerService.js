const path = require('path');
const { prisma } = require('../config/database');
const Chat = require('../models/Chat');
const Log = require('../models/Log');

async function checkScheduledMessages() {
  try {
    const pending = await prisma.scheduledMessage.findMany();
    if (pending.length === 0) return;

    const now = new Date();

    for (const sch of pending) {
      const schTime = new Date(sch.scheduledTime);
      if (schTime <= now) {
        const companyId = sch.company_id || 'comp_default';
        const chat = await Chat.findById(sch.chat_id, companyId);

        if (chat) {
          const newMessage = {
            sender: 'attendant',
            text: sch.text || '',
            timestamp: new Date(),
            is_ai: false,
            media_url: sch.media_url,
            media_type: sch.media_type,
            file_name: sch.file_name,
            is_scheduled: true
          };

          await Chat.addMessage(chat.id, newMessage);

          const { getActiveConnections } = require('./whatsappService');
          const conn = getActiveConnections()[chat.instance_id || 'inst_default'];
          const sock = conn?.sock;
          const connectionStatus = conn?.connectionStatus;

          if (connectionStatus === 'open' && sock) {
            try {
              const targetJid = sch.chat_id;
              if (sch.media_url) {
                const mediaPath = path.join(__dirname, '../../public', sch.media_url);
                if (sch.media_type === 'image') {
                  await sock.sendMessage(targetJid, { image: { url: mediaPath }, caption: sch.text || undefined });
                } else if (sch.media_type === 'video') {
                  await sock.sendMessage(targetJid, { video: { url: mediaPath }, caption: sch.text || undefined });
                } else if (sch.media_type === 'audio') {
                  await sock.sendMessage(targetJid, { audio: { url: mediaPath }, mimetype: 'audio/mp4', ptt: true });
                } else if (sch.media_type === 'document') {
                  await sock.sendMessage(targetJid, { 
                    document: { url: mediaPath }, 
                    mimetype: 'application/octet-stream', 
                    fileName: sch.file_name || 'Arquivo' 
                  });
                }
              } else {
                await sock.sendMessage(targetJid, { text: sch.text });
              }
              await Log.add(`[Agendamento] Mensagem enviada com sucesso para ${chat.client_name}.`, companyId);
            } catch (err) {
              await Log.add(`[Erro Agendamento] Falha ao enviar para ${chat.client_name}: ${err.message}`, companyId);
              
              await Chat.addMessage(chat.id, {
                sender: 'system',
                text: `⚠️ Erro ao enviar mensagem agendada: ${err.message}`,
                timestamp: new Date()
              });
            }
          } else {
            await Log.add(`[Erro Agendamento] WhatsApp desconectado. Mensagem falhou.`, companyId);
            await Chat.addMessage(chat.id, {
              sender: 'system',
              text: `⚠️ Falha no envio da mensagem agendada: WhatsApp desconectado.`,
              timestamp: new Date()
            });
          }
        }

        await prisma.scheduledMessage.delete({
          where: { id: sch.id }
        });
      }
    }
  } catch (error) {
    console.error('Error in checkScheduledMessages:', error);
  }
}

module.exports = {
  checkScheduledMessages
};
