const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { prisma } = require('../config/database');
const { UPLOAD_DIR } = require('../config/index');
const { emitToCompany } = require('../config/socket');
const Log = require('../models/Log');
const Chat = require('../models/Chat');
const Instance = require('../models/Instance');
const Metrics = require('../models/Metrics');
const aiService = require('./aiService');
const flowService = require('./flowService');
const { decrypt } = require('../utils/crypto');
const { inspectIncomingMessage } = require('../utils/incomingWhatsAppMessage');

const activeConnections = {};

function ensureValidSessionFolder(authFolder) {
  if (!fs.existsSync(authFolder)) {
    fs.mkdirSync(authFolder, { recursive: true });
    return;
  }
  let invalidFiles = [];
  try {
    const files = fs.readdirSync(authFolder, { withFileTypes: true });
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.json')) continue;
      const filePath = path.join(authFolder, file.name);
      try {
        const raw = fs.readFileSync(filePath, 'utf8').trim();
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') {
          invalidFiles.push(file.name);
        }
      } catch (err) {
        invalidFiles.push(file.name);
      }
    }
  } catch (err) {
    invalidFiles.push('read_error');
  }

  if (invalidFiles.length > 0) {
    fs.rmSync(authFolder, { recursive: true, force: true });
    fs.mkdirSync(authFolder, { recursive: true });
  }
}


const INCOMING_MEDIA_EXTENSIONS = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav',
  'application/pdf': 'pdf', 'text/plain': 'txt',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
};
const MAX_INCOMING_MEDIA_BYTES = 25 * 1024 * 1024;

const AI_REPLIES_PER_MINUTE = 6;
const aiActivity = new Map();

function reserveAiReply(chatId, now = Date.now()) {
  const entry = aiActivity.get(chatId) || { busy: false, calls: [] };
  entry.calls = entry.calls.filter(time => now - time < 60_000);
  if (entry.busy || entry.calls.length >= AI_REPLIES_PER_MINUTE) {
    aiActivity.set(chatId, entry);
    return false;
  }
  entry.busy = true;
  entry.calls.push(now);
  aiActivity.set(chatId, entry);
  return true;
}

function releaseAiReply(chatId) {
  const entry = aiActivity.get(chatId);
  if (!entry) return;
  entry.busy = false;
  if (!entry.calls.length) aiActivity.delete(chatId);
}

function incomingMediaExtension(mimetype) {
  return INCOMING_MEDIA_EXTENSIONS[String(mimetype || '').split(';')[0].trim().toLowerCase()] || null;
}

function shouldRetryAsLid(jid) {
  if (!jid.endsWith('@s.whatsapp.net')) return false;
  const id = jid.split('@')[0];
  return /^\d+$/.test(id) && id.length > 15;
}

const sentKeyIds = new Map();

function trackSentKey(instanceId, key) {
  const keyId = key?.id;
  if (!keyId) return;
  let ids = sentKeyIds.get(instanceId);
  if (!ids) {
    ids = new Set();
    sentKeyIds.set(instanceId, ids);
  }
  ids.add(keyId);
  if (ids.size > 1000) {
    for (const id of ids) {
      ids.delete(id);
      if (ids.size <= 1000) break;
    }
  }
}

function isOwnSentKey(instanceId, keyId) {
  return !!keyId && (sentKeyIds.get(instanceId)?.has(keyId) || false);
}

async function sendMessage(instanceId, jid, content) {
  const conn = activeConnections[instanceId];
  if (conn && conn.connectionStatus === 'open' && conn.sock) {
    try {
      const sent = await conn.sock.sendMessage(jid, content);
      trackSentKey(instanceId, sent?.key);
      return sent;
    } catch (err) {
      if (shouldRetryAsLid(jid)) {
        const sent = await conn.sock.sendMessage(jid.replace('@s.whatsapp.net', '@lid'), content);
        trackSentKey(instanceId, sent?.key);
        return sent;
      }
      throw err;
    }
  }
  return null;
}

function getActiveConnections() {
  return activeConnections;
}

async function extractMessagePayload(msg) {
  const { content, isEmptyProtocolStub } = inspectIncomingMessage(msg);
  if (!content) {
    return { ignoreReason: isEmptyProtocolStub ? 'stub' : 'empty' };
  }

  const imageMsg = content.imageMessage;
  const videoMsg = content.videoMessage;
  const audioMsg = content.audioMessage;
  const docMsg = content.documentMessage;
  const text = content.conversation ||
    content.extendedTextMessage?.text ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.buttonsResponseMessage?.selectedButtonId ||
    content.listResponseMessage?.title ||
    content.listResponseMessage?.singleSelectReply?.selectedRowId ||
    content.templateButtonReplyMessage?.selectedDisplayText ||
    content.templateButtonReplyMessage?.selectedId ||
    imageMsg?.caption ||
    videoMsg?.caption ||
    '';

  let mediaInfo = null;
  let unsupportedMedia = null;
  const mediaMsg = imageMsg || videoMsg || audioMsg || docMsg;
  if (mediaMsg) {
    const mediaType = imageMsg ? 'image' : videoMsg ? 'video' : audioMsg ? 'audio' : 'document';
    const ext = incomingMediaExtension(mediaMsg.mimetype);
    const size = Number(mediaMsg.fileLength || 0);
    if (!ext) {
      unsupportedMedia = `[Mídia não suportada: ${String(mediaMsg.mimetype || 'desconhecida').split(';')[0].slice(0, 80)}]`;
    } else if (size > MAX_INCOMING_MEDIA_BYTES) {
      unsupportedMedia = `[Mídia acima de ${MAX_INCOMING_MEDIA_BYTES / 1024 / 1024} MB não baixada]`;
    }

    if (!unsupportedMedia) try {
      const buffer = await downloadMediaMessage(
        msg,
        'buffer',
        {},
        { logger: pino({ level: 'silent' }) }
      );
      if (buffer.length > MAX_INCOMING_MEDIA_BYTES) throw new Error('Midia excede o limite de tamanho.');

      const fileName = docMsg?.fileName
        ? path.basename(String(docMsg.fileName)).slice(0, 200)
        : `${mediaType}_${Date.now()}.${ext}`;

      const fileSavedName = `${mediaType}_incoming_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const savePath = path.join(UPLOAD_DIR, fileSavedName);
      await fs.promises.writeFile(savePath, buffer);

      mediaInfo = {
        mediaUrl: `/uploads/${fileSavedName}`,
        mediaType,
        fileName
      };
    } catch (dlErr) {
      console.error(dlErr);
    }
  }

  const messageText = [text, unsupportedMedia].filter(Boolean).join('\n');
  if (!messageText && !mediaInfo) {
    return { ignoreReason: 'unsupported' };
  }

  const timestamp = Number(msg.messageTimestamp) > 0
    ? new Date(Number(msg.messageTimestamp) * 1000)
    : new Date();
  return { text: messageText, mediaInfo, timestamp };
}

async function startWhatsAppInstance(instanceId, companyId) {
  const current = activeConnections[instanceId];
  if (current?.starting || (current?.sock && ['open', 'connecting', 'qr'].includes(current.connectionStatus))) {
    return;
  }

  if (!activeConnections[instanceId]) {
    activeConnections[instanceId] = {};
  }
  const conn = activeConnections[instanceId];
  conn.starting = true;

  if (conn.reconnectTimer) {
    clearTimeout(conn.reconnectTimer);
    conn.reconnectTimer = null;
  }

  if (conn.sock) {
    try { conn.sock.ev.removeAllListeners(); conn.sock.end(undefined); } catch (err) { console.error(err); }
    conn.sock = null;
  }

  const authFolder = path.join(__dirname, `../../auth_info_baileys/${instanceId}`);
  ensureValidSessionFolder(authFolder);
  if (!fs.existsSync(authFolder)) {
    fs.mkdirSync(authFolder, { recursive: true });
  }

  let state, saveCreds;
  try {
    ({ state, saveCreds } = await useMultiFileAuthState(authFolder));
  } catch (err) {
    if (fs.existsSync(authFolder)) {
      fs.rmSync(authFolder, { recursive: true, force: true });
      fs.mkdirSync(authFolder, { recursive: true });
    }
    try {
      ({ state, saveCreds } = await useMultiFileAuthState(authFolder));
    } catch (retryErr) {
      conn.starting = false;
      throw retryErr;
    }
  }

  activeConnections[instanceId].connectionStatus = 'connecting';
  activeConnections[instanceId].qrCodeImage = null;
  activeConnections[instanceId].connectedPhone = null;
  activeConnections[instanceId].companyId = companyId;

  emitToCompany(companyId, 'whatsapp_status_updated', {
    instanceId,
    status: 'connecting',
    qr: null,
    phone: null
  });

  try {
    let version;
    try {
      const latest = await fetchLatestBaileysVersion();
      version = latest.version;
    } catch (verErr) {
      console.warn('Falha ao obter versao mais recente do Baileys:', verErr);
    }

    const sock = makeWASocket({
      ...(version ? { version } : {}),
      auth: state,
      printQRInTerminal: false,
      browser: ['AdapterConnect', 'Chrome', '1.0.0'],
      logger: pino({ level: 'silent' })
    });

    activeConnections[instanceId].sock = sock;
    activeConnections[instanceId].starting = false;

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
        const isLoggedOut = statusCode === DisconnectReason.loggedOut || statusCode === 401;
        const shouldReconnect = !isLoggedOut;
        
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
        
        if (isLoggedOut) {
          try {
            if (fs.existsSync(authFolder)) {
              fs.rmSync(authFolder, { recursive: true, force: true });
            }
          } catch (err) {
            console.error(err);
          }
        } else if (shouldReconnect) {
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
      if (!Array.isArray(m.messages) || m.messages.length === 0) return;

      for (const msg of m.messages) {
        if (!msg) continue;
        try {
          if (m.type !== 'notify') continue;

          const senderJid = msg.key.remoteJid;
          if (!senderJid) continue;
          if (senderJid.endsWith('@g.us') || senderJid === 'status@broadcast') continue;

          const payload = await extractMessagePayload(msg);
          if (payload.ignoreReason) {
            if (payload.ignoreReason === 'stub') {
              const reason = msg.messageStubParameters?.[0] ? ` (${String(msg.messageStubParameters[0]).slice(0, 60)})` : '';
              console.info(`[WhatsApp:${instanceId}] Stub de protocolo ${msg.messageStubType}${reason} sem conteudo de ${senderJid}; ignorado.`);
            } else if (payload.ignoreReason === 'empty') {
              console.warn(`[WhatsApp:${instanceId}] Mensagem sem conteudo processavel de ${senderJid}`);
            } else {
              console.warn(`[WhatsApp:${instanceId}] Mensagem ignorada sem texto/midia suportada de ${senderJid}`);
            }
            continue;
          }

          if (msg.key.fromMe) {
            if (isOwnSentKey(instanceId, msg.key.id)) continue;
            await recordAttendantMessage(senderJid, payload, instanceId, companyId);
            continue;
          }

          const phone = senderJid.split('@')[0];
          const name = msg.pushName || `Cliente (+${phone.slice(-4)})`;

          await handleIncomingWhatsAppMessage(senderJid, name, payload.text, payload.mediaInfo, instanceId, companyId);
        } catch (msgErr) {
          console.error(`[WhatsApp:${instanceId}] Erro ao processar mensagem do WhatsApp:`, msgErr);
          try {
            await Log.add(`Erro ao processar mensagem no WhatsApp (${instanceId}): ${msgErr.message}`, companyId);
          } catch (logErr) {
            console.error(logErr);
          }
        }
      }
    });
  } catch (err) {
    console.error(err);
    activeConnections[instanceId].starting = false;
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

  if (conn) {
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

  if (clearSession) {
    const authFolder = path.join(__dirname, `../../auth_info_baileys/${instanceId}`);
    if (fs.existsSync(authFolder)) {
      fs.rmSync(authFolder, { recursive: true, force: true });
    }
  }
}

async function sendBotMessage(chat, instanceId, text) {
  await Chat.addMessage(chat.id, { sender: 'attendant', text, timestamp: new Date(), is_ai: true });
  const conn = activeConnections[instanceId];
  if (conn && conn.connectionStatus === 'open' && conn.sock) {
    const sent = await conn.sock.sendMessage(Chat.getRemoteJid(chat), { text });
    trackSentKey(instanceId, sent?.key);
  }
}

async function runFlow(chat, message, isNewChat, instanceId, companyId) {
  let transferred = false;
  const handled = await flowService.handleIncoming({
    chat,
    message,
    isNewChat,
    actions: {
      send: text => sendBotMessage(chat, instanceId, text),
      transfer: async ({ toSales }) => {
        transferred = true;
        await Chat.update(chat.id, { ai_active: false, waiting_since: new Date(), ...(toSales ? { status: 'interesse em compra' } : {}) }, companyId);
        await Chat.addMessage(chat.id, { sender: 'system', text: 'Fluxo concluído: atendimento transferido para um atendente humano.', timestamp: new Date() });
        await Log.add(`Fluxo transferiu ${chat.client_name} para atendimento humano.`, companyId);
      }
    }
  });
  if (handled && !transferred && chat.waiting_since) {
    await Chat.update(chat.id, { waiting_since: null }, companyId);
  }
  return handled;
}

async function recordAttendantMessage(senderJid, payload, instanceId, companyId) {
  try {
    const chat = await Chat.findByRemoteJid(senderJid, companyId, instanceId);
    if (!chat) return;

    await Chat.addMessage(chat.id, {
      sender: 'attendant',
      text: payload.text,
      timestamp: payload.timestamp,
      is_ai: false,
      media_url: payload.mediaInfo?.mediaUrl,
      media_type: payload.mediaInfo?.mediaType,
      file_name: payload.mediaInfo?.fileName
    });

    if (chat.waiting_since) {
      await Chat.update(chat.id, { waiting_since: null }, companyId);
    }

    const updated = await Chat.findById(chat.id, companyId);
    emitToCompany(companyId, 'chat_updated', updated);
    emitToCompany(companyId, 'logs_updated', await Log.findAll(companyId));
  } catch (err) {
    console.error(`[WhatsApp:${instanceId}] Erro ao registrar mensagem do atendente:`, err);
  }
}

async function handleIncomingWhatsAppMessage(rawSenderJid, clientName, messageText, mediaInfo, instanceId, companyId) {
  try {
    const senderJid = rawSenderJid;
    let chat = await Chat.findByRemoteJid(senderJid, companyId, instanceId);
    const isNewChat = !chat;
    const cleanPhone = senderJid.split('@')[0];

    if (!chat) {
      const newChatData = {
        id: Chat.createChatId(companyId, instanceId, senderJid),
        remote_jid: senderJid,
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

    const chatAfterClientMsg = await Chat.findById(chat.id, companyId);
    emitToCompany(companyId, 'chat_updated', chatAfterClientMsg);
    emitToCompany(companyId, 'logs_updated', await Log.findAll(companyId));

    if (chat.is_blocked) {
      return chat;
    }

    if (await runFlow(chat, messageText || '', isNewChat, instanceId, companyId)) {
      const flowChat = await Chat.findById(chat.id, companyId);
      emitToCompany(companyId, 'chat_updated', flowChat);
      return flowChat;
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });

    const settings = await prisma.settings.findUnique({
      where: { company_id: companyId }
    });
    if (!settings) {
      return chat;
    }

    if (settings.ai_enabled) {
      if (chat.ai_active === false) {
        return chat;
      }

      if (!reserveAiReply(chat.id)) {
        console.warn(`[IA] Limite de respostas atingido para a conversa ${chat.id}.`);
      } else try {
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
        if (oldStatus === 'iniciada' && aiResponse.status === 'interesse em compra') {
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
          await Chat.update(chat.id, updates, companyId, undefined, { source: 'ai' });
        }

        await Log.add(`IA respondeu para ${chat.client_name}: "${aiResponse.message.substring(0, 40)}..."`, companyId);

        const conn = activeConnections[instanceId];
        if (conn && conn.connectionStatus === 'open' && conn.sock) {
          const sent = await conn.sock.sendMessage(Chat.getRemoteJid(chat), { text: aiResponse.message });
          trackSentKey(instanceId, sent?.key);
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
            await conn.sock.sendMessage(Chat.getRemoteJid(chat), {
              text: `⚠️ *Erro no Atendente de IA:* Desculpe, não conseguimos processar sua mensagem devido a um erro técnico temporário. Por favor, tente novamente em alguns instantes.`
            });
          } catch (waErr) {
            console.error(waErr);
          }
        }
      } finally {
        releaseAiReply(chat.id);
      }
    }

    const finalChat = await Chat.findById(chat.id, companyId);
    emitToCompany(companyId, 'chat_updated', finalChat);
    emitToCompany(companyId, 'logs_updated', await Log.findAll(companyId));
    
    return finalChat;
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
