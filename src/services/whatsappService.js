const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const { prisma } = require('../config/database');
const { UPLOAD_DIR } = require('../config/index');
const { emitToCompany } = require('../config/socket');
const Log = require('../models/Log');
const Chat = require('../models/Chat');
const Instance = require('../models/Instance');
const Metrics = require('../models/Metrics');
const aiService = require('./aiService');
const { createMercadoPagoPreference } = require('./mercadoPagoService');

const activeConnections = {};

async function sendMessage(instanceId, jid, content) {
  const conn = activeConnections[instanceId];
  if (conn && conn.connectionStatus === 'open' && conn.sock) {
    const targetJid = jid.endsWith('@lid') ? jid.replace('@lid', '@s.whatsapp.net') : jid;
    return await conn.sock.sendMessage(targetJid, content);
  }
  return null;
}

function getActiveConnections() {
  return activeConnections;
}

async function startWhatsAppInstance(instanceId, companyId) {
  if (activeConnections[instanceId] && activeConnections[instanceId].connectionStatus === 'open') {
    return;
  }

  if (activeConnections[instanceId]?.reconnectTimer) {
    clearTimeout(activeConnections[instanceId].reconnectTimer);
  }

  const authFolder = path.join(__dirname, `../../auth_info_baileys_${instanceId}`);
  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  
  if (!activeConnections[instanceId]) {
    activeConnections[instanceId] = {};
  }
  
  activeConnections[instanceId].connectionStatus = 'connecting';
  activeConnections[instanceId].qrCodeImage = null;
  activeConnections[instanceId].connectedPhone = null;

  emitToCompany(companyId, 'whatsapp_status_updated', {
    instanceId,
    status: 'connecting',
    qr: null,
    phone: null
  });

  try {
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' })
    });

    activeConnections[instanceId].sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        try {
          const qrImage = await QRCode.toDataURL(qr);
          activeConnections[instanceId].qrCodeImage = qrImage;
          activeConnections[instanceId].connectionStatus = 'qr';
          emitToCompany(companyId, 'whatsapp_status_updated', {
            instanceId,
            status: 'qr',
            qr: qrImage,
            phone: null
          });
        } catch (err) {
          console.error(err);
        }
      }
      
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        activeConnections[instanceId].connectionStatus = 'disconnected';
        activeConnections[instanceId].qrCodeImage = null;
        activeConnections[instanceId].connectedPhone = null;
        
        emitToCompany(companyId, 'whatsapp_status_updated', {
          instanceId,
          status: 'disconnected',
          qr: null,
          phone: null
        });

        await Instance.updateStatus(instanceId, 'disconnected', null, companyId);
        
        if (shouldReconnect) {
          activeConnections[instanceId].reconnectTimer = setTimeout(() => {
            startWhatsAppInstance(instanceId, companyId).catch(err => console.error(err));
          }, 5000);
        }
      } else if (connection === 'open') {
        const userJid = sock.user.id;
        const phone = userJid.split(':')[0].split('@')[0];
        
        activeConnections[instanceId].connectionStatus = 'open';
        activeConnections[instanceId].connectedPhone = phone;
        activeConnections[instanceId].qrCodeImage = null;

        emitToCompany(companyId, 'whatsapp_status_updated', {
          instanceId,
          status: 'open',
          qr: null,
          phone: phone
        });

        await Instance.updateStatus(instanceId, 'connected', phone, companyId);
        await Log.add(`WhatsApp pareado e conectado na conexão número +${phone}`, companyId);
        
        const allLogs = await Log.findAll(companyId);
        emitToCompany(companyId, 'logs_updated', allLogs);
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg) return;
      
      if (!msg.key.fromMe && m.type === 'notify') {
        const senderJid = msg.key.remoteJid;
        if (senderJid.endsWith('@g.us') || senderJid === 'status@broadcast') return;
        
        const phone = senderJid.split('@')[0];
        const name = msg.pushName || `Cliente (+${phone.slice(-4)})`;
        
        const getMessageContent = (message) => {
          if (!message) return null;
          if (message.ephemeralMessage) return getMessageContent(message.ephemeralMessage.message);
          if (message.viewOnceMessage) return getMessageContent(message.viewOnceMessage.message);
          if (message.viewOnceMessageV2) return getMessageContent(message.viewOnceMessageV2.message);
          return message;
        };

        const content = getMessageContent(msg.message);
        if (!content) return;

        const imageMsg = content.imageMessage;
        const videoMsg = content.videoMessage;
        const audioMsg = content.audioMessage;
        const docMsg = content.documentMessage;
        const text = content.conversation || content.extendedTextMessage?.text || imageMsg?.caption || videoMsg?.caption || '';
        
        let mediaInfo = null;
        if (imageMsg || videoMsg || audioMsg || docMsg) {
          try {
            const buffer = await downloadMediaMessage(
              msg,
              'buffer',
              {},
              { logger: pino({ level: 'silent' }) }
            );

            let ext = 'bin';
            let mediaType = 'document';
            let fileName = 'arquivo';

            if (imageMsg) {
              mediaType = 'image';
              let rawExt = imageMsg.mimetype?.split('/')[1] || 'jpg';
              ext = rawExt.split(';')[0].trim();
              fileName = `image_${Date.now()}.${ext}`;
            } else if (videoMsg) {
              mediaType = 'video';
              let rawExt = videoMsg.mimetype?.split('/')[1] || 'mp4';
              ext = rawExt.split(';')[0].trim();
              fileName = `video_${Date.now()}.${ext}`;
            } else if (audioMsg) {
              mediaType = 'audio';
              let rawExt = audioMsg.mimetype?.split('/')[1] || 'mp3';
              ext = rawExt.split(';')[0].trim();
              fileName = `audio_${Date.now()}.${ext}`;
            } else if (docMsg) {
              mediaType = 'document';
              fileName = docMsg.fileName || `doc_${Date.now()}`;
              let rawExt = path.extname(fileName).slice(1) || docMsg.mimetype?.split('/')[1] || 'bin';
              ext = rawExt.split(';')[0].trim();
              if (!fileName.includes('.')) fileName = `${fileName}.${ext}`;
            }

            const fileSavedName = `${mediaType}_incoming_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
            const savePath = path.join(UPLOAD_DIR, fileSavedName);
            fs.writeFileSync(savePath, buffer);

            mediaInfo = {
              mediaUrl: `/uploads/${fileSavedName}`,
              mediaType,
              fileName
            };
          } catch (dlErr) {
            console.error(dlErr);
          }
        }

        if (!text && !mediaInfo) return;
        await handleIncomingWhatsAppMessage(senderJid, name, text, mediaInfo, instanceId, companyId);
      }
    });

  } catch (err) {
    console.error(err);
    activeConnections[instanceId].connectionStatus = 'disconnected';
    emitToCompany(companyId, 'whatsapp_status_updated', {
      instanceId,
      status: 'disconnected',
      qr: null,
      phone: null
    });

    activeConnections[instanceId].reconnectTimer = setTimeout(() => {
      startWhatsAppInstance(instanceId, companyId).catch(err => console.error(err));
    }, 10000);
  }
}

async function stopWhatsAppInstance(instanceId, clearSession = false) {
  const conn = activeConnections[instanceId];
  if (!conn) return;

  if (conn.reconnectTimer) {
    clearTimeout(conn.reconnectTimer);
    conn.reconnectTimer = null;
  }

  if (conn.sock) {
    try {
      if (clearSession) {
        await conn.sock.logout();
      } else {
        await conn.sock.end();
      }
    } catch (err) {
      console.error(err);
    }
    conn.sock = null;
  }

  if (clearSession) {
    const authFolder = path.join(__dirname, `../../auth_info_baileys_${instanceId}`);
    if (fs.existsSync(authFolder)) {
      fs.rmSync(authFolder, { recursive: true, force: true });
    }
  }

  conn.connectionStatus = 'disconnected';
  conn.qrCodeImage = null;
  conn.connectedPhone = null;

  emitToCompany(conn.companyId || 'comp_default', 'whatsapp_status_updated', {
    instanceId,
    status: 'disconnected',
    qr: null,
    phone: null
  });
}

async function handleIncomingWhatsAppMessage(rawSenderJid, clientName, messageText, mediaInfo, instanceId, companyId) {
  try {
    const senderJid = rawSenderJid.endsWith('@lid') ? rawSenderJid.replace('@lid', '@s.whatsapp.net') : rawSenderJid;
    let chat = await Chat.findById(senderJid, companyId);
    const cleanPhone = senderJid.split('@')[0];

    if (!chat) {
      const newChatData = {
        id: senderJid,
        client_name: clientName || `Cliente (+${cleanPhone.slice(-4)})`,
        client_phone: cleanPhone,
        status: 'iniciada',
        assigned_to: null,
        ai_active: true,
        tags: [],
        is_favorite: false,
        is_archived: false,
        is_blocked: false,
        waiting_since: new Date(),
        company_id: companyId,
        instance_id: instanceId
      };
      chat = await Chat.create(newChatData, companyId);
      await Log.add(`Novo chat iniciado para o cliente ${chat.client_name} (${cleanPhone}).`, companyId);
    } else if (!chat.waiting_since) {
      chat = await Chat.update(chat.id, { waiting_since: new Date() }, companyId);
    }

    const resolvedText = messageText || (mediaInfo ? `[Mídia: ${mediaInfo.mediaType === 'image' ? 'Imagem' : mediaInfo.mediaType === 'video' ? 'Vídeo' : mediaInfo.mediaType === 'audio' ? 'Áudio' : 'Documento'}]` : '');

    const clientMsg = {
      sender: 'client',
      text: resolvedText,
      timestamp: new Date(),
      is_ai: false,
      media_url: mediaInfo?.mediaUrl,
      media_type: mediaInfo?.mediaType,
      file_name: mediaInfo?.fileName
    };
    await Chat.addMessage(chat.id, clientMsg);

    emitToCompany(companyId, 'chats_updated', await Chat.findAll(companyId));
    emitToCompany(companyId, 'logs_updated', await Log.findAll(companyId));

    if (chat.is_blocked) {
      return chat;
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });

    const settings = await prisma.settings.findUnique({
      where: { company_id: companyId }
    }) || await prisma.settings.findUnique({
      where: { company_id: 'comp_default' }
    });

    if (settings.ai_enabled) {
      if (chat.ai_active === false) {
        return chat;
      }

      try {
        const freshChat = await Chat.findById(chat.id, companyId);
        const aiResponse = await aiService.runAiAttendant(freshChat, resolvedText, settings);
        
        const aiMsg = {
          sender: 'attendant',
          text: aiResponse.message,
          timestamp: new Date(),
          is_ai: true
        };
        
        await Chat.addMessage(chat.id, aiMsg);

        if (chat.waiting_since) {
          const durationSeconds = Math.round((new Date() - new Date(chat.waiting_since)) / 1000);
          await Metrics.addResponseTime({
            chatId: chat.id,
            attendantId: 'AI',
            isAi: true,
            durationSeconds,
            timestamp: new Date(),
            company_id: companyId
          }, companyId);
          await Chat.update(chat.id, { waiting_since: null }, companyId);
        }
        
        const updates = {};
        const oldStatus = chat.status;
        if (aiResponse.status && ['iniciada', 'interesse em compra', 'finalizada'].includes(aiResponse.status)) {
          updates.status = aiResponse.status;
          if (oldStatus !== aiResponse.status) {
            await Log.add(`Status do cliente ${chat.client_name} alterado automaticamente pela IA de '${oldStatus}' para '${aiResponse.status}'.`, companyId);
          }
        }

        if (aiResponse.disable_ai === true || aiResponse.status === 'transbordo' ||
            (aiResponse.message && (aiResponse.message.toLowerCase().includes('atendente humano') || 
                                    aiResponse.message.toLowerCase().includes('transferir para um atendente')))) {
          updates.ai_active = false;
          await Chat.addMessage(chat.id, {
            sender: 'system',
            text: `🚨 Atendimento transferido para atendente humano. IA desativada nesta conversa.`,
            timestamp: new Date()
          });
          await Log.add(`Handoff automático acionado para ${chat.client_name}. IA desativada nesta conversa.`, companyId);
        }

        if (Object.keys(updates).length > 0) {
          await Chat.update(chat.id, updates, companyId);
        }

        await Log.add(`IA respondeu para ${chat.client_name}: "${aiResponse.message.substring(0, 40)}..."`, companyId);

        const conn = activeConnections[instanceId];
        if (conn && conn.connectionStatus === 'open' && conn.sock) {
          await conn.sock.sendMessage(senderJid, { text: aiResponse.message });
        }

        if (aiResponse.trigger_billing) {
          if (company?.mp_enabled) {
            const billingItem = aiResponse.billing_item || 'Produto CRM';
            const billingValue = aiResponse.billing_value || 100.00;
            
            try {
              const mpSettings = {
                ...settings,
                mp_enabled: company.mp_enabled,
                mp_access_token: company.mp_access_token,
                mp_public_key: company.mp_public_key
              };
              
              const paymentData = await createMercadoPagoPreference(chat.id, billingItem, billingValue, mpSettings);
              
              const paymentMsg = {
                sender: 'system',
                text: `🔗 Cobrança Gerada: ${billingItem} - R$ ${Number(billingValue).toFixed(2)}. Link para pagar: ${paymentData.url}`,
                timestamp: new Date(),
                is_ai: false,
                payment_id: paymentData.id,
                payment_url: paymentData.url,
                payment_status: 'pending'
              };
              
              await Chat.addMessage(chat.id, paymentMsg);
              await Chat.update(chat.id, { status: 'interesse em compra' }, companyId);
              await Log.add(`Cobrança gerada automaticamente pela IA para ${chat.client_name}: ${billingItem} (R$ ${billingValue})`, companyId);

              if (conn && conn.connectionStatus === 'open' && conn.sock) {
                await conn.sock.sendMessage(senderJid, { 
                  text: `💳 *Link de Pagamento Gerado!*\n\n*Item:* ${billingItem}\n*Valor:* R$ ${Number(billingValue).toFixed(2)}\n\nLink para pagamento: ${paymentData.url}` 
                });
              }
            } catch (payErr) {
              await Log.add(`Falha ao gerar cobrança automática para ${chat.client_name}: ${payErr.message}`, companyId);
              
              await Chat.addMessage(chat.id, {
                sender: 'system',
                text: `⚠️ Erro ao gerar cobrança Mercado Pago: ${payErr.message}. Verifique as configurações.`,
                timestamp: new Date()
              });
            }
          } else {
            await Chat.addMessage(chat.id, {
              sender: 'system',
              text: `⚠️ O assistente tentou gerar uma cobrança, mas o módulo de recebimento automático do Mercado Pago está desativado nas configurações.`,
              timestamp: new Date()
            });
          }
        }
      } catch (err) {
        await Log.add(`Erro ao processar IA para ${chat.client_name}: ${err.message}`, companyId);
        
        await Chat.addMessage(chat.id, {
          sender: 'system',
          text: `⚠️ [Erro na API de IA - Provedor: ${settings.ai_provider}]: ${err.message}. Verifique suas configurações e chaves de API no painel.`,
          timestamp: new Date()
        });

        const conn = activeConnections[instanceId];
        if (conn && conn.connectionStatus === 'open' && conn.sock) {
          try {
            await conn.sock.sendMessage(senderJid, {
              text: `⚠️ *Erro no Atendente de IA:* Desculpe, não conseguimos processar sua mensagem devido a um erro técnico temporário. Por favor, tente novamente em alguns instantes.`
            });
          } catch (waErr) {
            console.error(waErr);
          }
        }
      }
    }

    emitToCompany(companyId, 'chats_updated', await Chat.findAll(companyId));
    emitToCompany(companyId, 'logs_updated', await Log.findAll(companyId));
    
    return await Chat.findById(senderJid, companyId);
  } catch (error) {
    console.error('Error in handleIncomingWhatsAppMessage:', error);
  }
}

module.exports = {
  startWhatsAppInstance,
  stopWhatsAppInstance,
  sendMessage,
  getActiveConnections,
  handleIncomingWhatsAppMessage
};
