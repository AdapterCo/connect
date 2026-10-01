let baileysModulePromise = null;

async function getBaileys() {
  if (!baileysModulePromise) {
    baileysModulePromise = import('@whiskeysockets/baileys');
  }

  return baileysModulePromise;
}

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
const flowService = require('./flowService');
const { decrypt } = require('../utils/crypto');

const activeConnections = {};
const recentServerSentIds = new Set();

function registerSentMessageId(id) {
  if (!id) return;
  recentServerSentIds.add(id);
  setTimeout(() => {
    recentServerSentIds.delete(id);
  }, 120000);
}

async function sendMessage(instanceId, jid, content) {
  const conn = activeConnections[instanceId];

  if (
    !conn ||
    conn.connectionStatus !== 'open' ||
    !conn.sock
  ) {
    return null;
  }

  const result = await conn.sock.sendMessage(jid, content);
  if (result?.key?.id) {
    registerSentMessageId(result.key.id);
  }
  return result;
}


function getActiveConnections() {
  return activeConnections;
}


/**
 * Inicia uma instância do WhatsApp.
 */
async function startWhatsAppInstance(instanceId, companyId) {
  /*
   * Baileys 7 é ESM.
   *
   * Como o AdapterConnect continua CommonJS,
   * carregamos a biblioteca usando import() dinâmico.
   */
  const baileys = await getBaileys();

  const makeWASocket = baileys.default;

  const {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadMediaMessage
  } = baileys;


  /*
   * Impede dois sockets simultâneos para a mesma instância.
   */
  const existing = activeConnections[instanceId];

  if (
    existing &&
    ['connecting', 'qr', 'open'].includes(existing.connectionStatus)
  ) {
    return;
  }


  /*
   * Cancela timer de reconexão antigo.
   */
  if (existing?.reconnectTimer) {
    clearTimeout(existing.reconnectTimer);
    existing.reconnectTimer = null;
  }


  /*
   * Diretório persistente das credenciais.
   */
  const authFolder = path.join(
    __dirname,
    `../../auth_info_baileys/${instanceId}`
  );


  /*
   * O useMultiFileAuthState da versão atual do Baileys
   * gerencia as credenciais e chaves Signal.
   */
  const {
    state,
    saveCreds
  } = await useMultiFileAuthState(authFolder);


  if (!activeConnections[instanceId]) {
    activeConnections[instanceId] = {};
  }


  const connectionState = activeConnections[instanceId];

  connectionState.connectionStatus = 'connecting';
  connectionState.qrCodeImage = null;
  connectionState.connectedPhone = null;
  connectionState.companyId = companyId;
  connectionState.reconnectTimer = null;


  emitToCompany(
    companyId,
    'whatsapp_status_updated',
    {
      instanceId,
      status: 'connecting',
      qr: null,
      phone: null
    }
  );


  try {
    /*
     * Busca versão atual do protocolo WhatsApp.
     */
    const { version } = await fetchLatestBaileysVersion();


    /*
     * Cria socket.
     */
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({
        level: 'silent'
      }),
      getMessage: async (key) => {
        if (!key?.id) return undefined;
        try {
          const stored = await prisma.message.findFirst({
            where: { id: key.id }
          });
          if (stored?.text) {
            return { conversation: stored.text };
          }
        } catch {
        }
        return undefined;
      }
    });


    /*
     * Guarda o socket atual da instância.
     */
    connectionState.sock = sock;


    /*
     * Salva alterações das credenciais.
     */
    sock.ev.on(
      'creds.update',
      saveCreds
    );


    /*
     * EVENTOS DE CONEXÃO
     */
    sock.ev.on(
      'connection.update',
      async (update) => {
        const {
          connection,
          lastDisconnect,
          qr
        } = update;


        /*
         * QR CODE
         */
        if (qr) {
          try {
            /*
             * Ignora QR emitido por socket antigo.
             */
            if (
              activeConnections[instanceId]?.sock !== sock
            ) {
              return;
            }


            const qrImage =
              await QRCode.toDataURL(qr);


            activeConnections[instanceId].qrCodeImage =
              qrImage;

            activeConnections[instanceId].connectionStatus =
              'qr';


            emitToCompany(
              companyId,
              'whatsapp_status_updated',
              {
                instanceId,
                status: 'qr',
                qr: qrImage,
                phone: null
              }
            );

          } catch (err) {
            console.error(err);
          }
        }


        /*
         * CONEXÃO FECHADA
         */
        if (connection === 'close') {
          /*
           * Se outro socket já substituiu este,
           * ignoramos eventos tardios do socket antigo.
           */
          if (
            activeConnections[instanceId]?.sock &&
            activeConnections[instanceId].sock !== sock
          ) {
            return;
          }


          const statusCode =
            lastDisconnect?.error?.output?.statusCode;


          const shouldReconnect =
            statusCode !== DisconnectReason.loggedOut;


          if (!activeConnections[instanceId]) {
            return;
          }


          /*
           * Remove referência ao socket encerrado
           * ANTES de iniciar uma nova conexão.
           */
          if (
            activeConnections[instanceId].sock === sock
          ) {
            activeConnections[instanceId].sock = null;
          }


          activeConnections[instanceId].connectionStatus =
            'disconnected';

          activeConnections[instanceId].qrCodeImage =
            null;

          activeConnections[instanceId].connectedPhone =
            null;


          emitToCompany(
            companyId,
            'whatsapp_status_updated',
            {
              instanceId,
              status: 'disconnected',
              qr: null,
              phone: null
            }
          );


          await Instance.updateStatus(
            instanceId,
            'disconnected',
            null,
            companyId
          );


          /*
           * Reconecta automaticamente,
           * exceto quando houve logout.
           */
          if (shouldReconnect) {
            if (
              activeConnections[instanceId].reconnectTimer
            ) {
              clearTimeout(
                activeConnections[instanceId].reconnectTimer
              );
            }


            activeConnections[instanceId].reconnectTimer =
              setTimeout(
                () => {
                  if (
                    activeConnections[instanceId]
                  ) {
                    activeConnections[
                      instanceId
                    ].reconnectTimer = null;
                  }


                  startWhatsAppInstance(
                    instanceId,
                    companyId
                  ).catch((err) => {
                    console.error(err);
                  });

                },
                5000
              );
          }
        }


        /*
         * CONEXÃO ABERTA
         */
        else if (connection === 'open') {
          /*
           * Socket antigo não pode assumir a conexão.
           */
          if (
            activeConnections[instanceId]?.sock !== sock
          ) {
            return;
          }


          const userJid =
            sock.user?.id || '';


          const phone =
            userJid
              .split(':')[0]
              .split('@')[0];


          activeConnections[instanceId].connectionStatus =
            'open';

          activeConnections[instanceId].connectedPhone =
            phone;

          activeConnections[instanceId].qrCodeImage =
            null;


          emitToCompany(
            companyId,
            'whatsapp_status_updated',
            {
              instanceId,
              status: 'open',
              qr: null,
              phone
            }
          );


          await Instance.updateStatus(
            instanceId,
            'connected',
            phone,
            companyId
          );


          await Log.add(
            `WhatsApp pareado e conectado na conexão número +${phone}`,
            companyId
          );


          const allLogs =
            await Log.findAll(companyId);


          emitToCompany(
            companyId,
            'logs_updated',
            allLogs
          );
        }
      }
    );


    /*
     * RECEBIMENTO DE MENSAGENS
     */
    sock.ev.on('messages.upsert', async (m) => {
        /*
         * Ignora eventos provenientes de socket antigo.
         */
        if (
          activeConnections[instanceId]?.sock !== sock
        ) {
          return;
        }


        if (
          !Array.isArray(m.messages) ||
          m.messages.length === 0
        ) {
          return;
        }


        for (const msg of m.messages) {
          if (!msg) {
            continue;
          }


          try {
            if (
              m.type !== 'notify' &&
              m.type !== 'append'
            ) {
              continue;
            }

            if (msg.key?.id && recentServerSentIds.has(msg.key.id)) {
              recentServerSentIds.delete(msg.key.id);
              continue;
            }


            /*
             * JID principal entregue pelo Baileys.
             *
             * Pode ser:
             *
             * numero@s.whatsapp.net
             *
             * ou:
             *
             * identificador@lid
             *
             * NÃO alteramos esse valor manualmente.
             */
            const senderJid =
              msg.key?.remoteJid;


            if (!senderJid) {
              continue;
            }


            /*
             * Ignora grupos e status.
             */
            if (
              senderJid.endsWith('@g.us') ||
              senderJid === 'status@broadcast'
            ) {
              continue;
            }


            /*
             * Na v7 pode existir também o JID alternativo.
             *
             * Guardamos somente para diagnóstico/futuras
             * resoluções PN <-> LID.
             *
             * O remoteJid principal continua sendo preservado.
             */
            const senderJidAlt =
              msg.key?.remoteJidAlt || null;


            const senderIdentifier =
              senderJid.split('@')[0];

            const rawSenderDigits = senderIdentifier.replace(/\D/g, '');
            const rawAltDigits = senderJidAlt ? senderJidAlt.split('@')[0].replace(/\D/g, '') : null;
            const candidatePhones = new Set();
            if (rawSenderDigits) {
              candidatePhones.add(rawSenderDigits);
              if (rawSenderDigits.startsWith('55')) candidatePhones.add(rawSenderDigits.slice(2));
              else candidatePhones.add('55' + rawSenderDigits);
            }
            if (rawAltDigits) {
              candidatePhones.add(rawAltDigits);
              if (rawAltDigits.startsWith('55')) candidatePhones.add(rawAltDigits.slice(2));
              else candidatePhones.add('55' + rawAltDigits);
            }
            const phonesList = Array.from(candidatePhones);

            const isCompanyInstance = await prisma.instance.findFirst({
              where: {
                company_id: companyId,
                phone: { in: phonesList }
              }
            });
            if (isCompanyInstance) {
              continue;
            }

            const teamMember = await prisma.user.findFirst({
              where: {
                company_id: companyId,
                phone: { in: phonesList }
              }
            });

            if (teamMember) {
              const pendingChat = await prisma.chat.findFirst({
                where: {
                  company_id: companyId,
                  assigned_to: teamMember.id,
                  status: 'interesse em compra',
                  sales_reply_due_at: { not: null }
                },
                orderBy: { updated_at: 'desc' }
              });

              if (pendingChat) {
                await Chat.update(pendingChat.id, { sales_reply_due_at: null }, companyId);
                await Chat.addMessage(pendingChat.id, {
                  sender: 'system',
                  text: `Vendedor ${teamMember.name} confirmou atendimento via WhatsApp. Rodízio pausado.`,
                  timestamp: new Date()
                });
                const updated = await Chat.findById(pendingChat.id, companyId);
                emitToCompany(companyId, 'chat_updated', updated);

                await sendMessage(instanceId, senderJid, {
                  text: `✅ Atendimento confirmado para o cliente *${pendingChat.client_name}* (+${pendingChat.client_phone})!\nO rodízio foi pausado para este lead.`
                });
              }
              continue;
            }

            const name =
              msg.pushName ||
              `Cliente (+${senderIdentifier.slice(-4)})`;


            /*
             * Desempacota mensagens temporárias e view-once.
             */
            const getMessageContent = (message) => {
              if (!message) {
                return null;
              }

              if (message.ephemeralMessage) {
                return getMessageContent(
                  message.ephemeralMessage.message
                );
              }

              if (message.viewOnceMessage) {
                return getMessageContent(
                  message.viewOnceMessage.message
                );
              }

              if (message.viewOnceMessageV2) {
                return getMessageContent(
                  message.viewOnceMessageV2.message
                );
              }

              if (message.viewOnceMessageV2Extension) {
                return getMessageContent(
                  message.viewOnceMessageV2Extension.message
                );
              }

              if (message.documentWithCaptionMessage) {
                return getMessageContent(
                  message.documentWithCaptionMessage.message
                );
              }

              if (message.editedMessage) {
                return getMessageContent(
                  message.editedMessage.message?.protocolMessage?.editedMessage ||
                  message.editedMessage.message
                );
              }

              return message;
            };

            const content =
              getMessageContent(
                msg.message
              );

            if (!content) {
              if (msg.messageStubType !== undefined) {
                continue;
              }

              console.warn(
                `[WhatsApp:${instanceId}] Mensagem sem conteudo processavel de ${senderJid}` +
                (
                  senderJidAlt
                    ? ` (alternativo: ${senderJidAlt})`
                    : ''
                )
              );

              continue;
            }


            /*
             * Tipos de mídia.
             */
            const imageMsg =
              content.imageMessage;

            const videoMsg =
              content.videoMessage;

            const audioMsg =
              content.audioMessage;

            const docMsg =
              content.documentMessage;


            /*
             * Conteúdo textual.
             */
            const text =
              content.conversation ||
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


            /*
             * Download e armazenamento de mídia.
             */
            let mediaInfo = null;


            if (
              imageMsg ||
              videoMsg ||
              audioMsg ||
              docMsg
            ) {
              try {
                const buffer =
                  await downloadMediaMessage(
                    msg,
                    'buffer',
                    {},
                    {
                      logger: pino({
                        level: 'silent'
                      })
                    }
                  );


                let ext = 'bin';
                let mediaType = 'document';
                let fileName = 'arquivo';


                /*
                 * IMAGEM
                 */
                if (imageMsg) {
                  mediaType = 'image';


                  let rawExt =
                    imageMsg.mimetype
                      ?.split('/')[1] ||
                    'jpg';


                  ext =
                    rawExt
                      .split(';')[0]
                      .trim();


                  fileName =
                    `image_${Date.now()}.${ext}`;
                }


                /*
                 * VÍDEO
                 */
                else if (videoMsg) {
                  mediaType = 'video';


                  let rawExt =
                    videoMsg.mimetype
                      ?.split('/')[1] ||
                    'mp4';


                  ext =
                    rawExt
                      .split(';')[0]
                      .trim();


                  fileName =
                    `video_${Date.now()}.${ext}`;
                }


                /*
                 * ÁUDIO
                 */
                else if (audioMsg) {
                  mediaType = 'audio';


                  let rawExt =
                    audioMsg.mimetype
                      ?.split('/')[1] ||
                    'mp3';


                  ext =
                    rawExt
                      .split(';')[0]
                      .trim();


                  fileName =
                    `audio_${Date.now()}.${ext}`;
                }


                /*
                 * DOCUMENTO
                 */
                else if (docMsg) {
                  mediaType = 'document';


                  fileName =
                    docMsg.fileName ||
                    `doc_${Date.now()}`;


                  let rawExt =
                    path
                      .extname(fileName)
                      .slice(1) ||
                    docMsg.mimetype
                      ?.split('/')[1] ||
                    'bin';


                  ext =
                    rawExt
                      .split(';')[0]
                      .trim();


                  if (
                    !fileName.includes('.')
                  ) {
                    fileName =
                      `${fileName}.${ext}`;
                  }
                }


                const fileSavedName =
                  `${mediaType}_incoming_${Date.now()}_${Math.floor(
                    Math.random() * 1000
                  )}.${ext}`;


                const savePath =
                  path.join(
                    UPLOAD_DIR,
                    fileSavedName
                  );


                await fs.promises.writeFile(
                  savePath,
                  buffer
                );


                mediaInfo = {
                  mediaUrl:
                    `/uploads/${fileSavedName}`,

                  mediaType,

                  fileName
                };

              } catch (dlErr) {
                console.error(
                  `[WhatsApp:${instanceId}] Erro ao baixar mídia:`,
                  dlErr
                );
              }
            }


            /*
             * Ignora mensagens sem texto ou mídia utilizável.
             */
            if (
              !text &&
              !mediaInfo
            ) {
              console.warn(
                `[WhatsApp:${instanceId}] Mensagem ignorada sem texto/midia suportada de ${senderJid}`
              );

              continue;
            }

            if (msg.key?.fromMe) {
              const inst = await prisma.instance.findUnique({
                where: { id: instanceId },
                select: { id: true, name: true, user_id: true }
              });

              let cleanPhone = senderIdentifier;
              if (senderJid.endsWith('@lid') && senderJidAlt && senderJidAlt.includes('@s.whatsapp.net')) {
                cleanPhone = senderJidAlt.split('@')[0];
              } else if (senderJidAlt && senderJidAlt.includes('@s.whatsapp.net') && !senderJid.endsWith('@s.whatsapp.net')) {
                cleanPhone = senderJidAlt.split('@')[0];
              }

              const candidateClientPhones = new Set();
              const rawClean = cleanPhone.replace(/\D/g, '');
              if (rawClean) {
                candidateClientPhones.add(rawClean);
                if (rawClean.startsWith('55')) candidateClientPhones.add(rawClean.slice(2));
                else candidateClientPhones.add('55' + rawClean);
              }
              const clientPhonesList = Array.from(candidateClientPhones);

              const otherChat = await prisma.chat.findFirst({
                where: {
                  company_id: companyId,
                  client_phone: { in: clientPhonesList },
                  sales_reply_due_at: { not: null }
                },
                orderBy: { updated_at: 'desc' }
              });

              if (otherChat) {
                await Chat.update(otherChat.id, {
                  sales_reply_due_at: null,
                  status: 'interesse em compra'
                }, companyId);
                await Chat.addMessage(otherChat.id, {
                  sender: 'system',
                  text: `Vendedor iniciou atendimento via WhatsApp (${inst?.name || 'conexão do vendedor'}). Rodízio pausado.`,
                  timestamp: new Date()
                });
                const updatedOther = await Chat.findById(otherChat.id, companyId);
                emitToCompany(companyId, 'chat_updated', updatedOther);
              }

              let chat = await Chat.findByRemoteJid(senderJid, companyId, instanceId);

              if (!chat) {
                const newChatData = {
                  id: Chat.createChatId(companyId, instanceId, senderJid),
                  remote_jid: senderJid,
                  client_name: otherChat?.client_name || `Cliente (+${cleanPhone.slice(-4)})`,
                  client_phone: cleanPhone,
                  status: 'interesse em compra',
                  assigned_to: inst?.user_id || otherChat?.assigned_to || null,
                  sector: otherChat?.sector || 'sales',
                  ai_active: false,
                  tags: otherChat?.tags || [],
                  is_favorite: false,
                  is_archived: false,
                  is_blocked: false,
                  waiting_since: null,
                  company_id: companyId,
                  instance_id: instanceId
                };
                chat = await Chat.create(newChatData, companyId);
              } else {
                const updates = {
                  sales_reply_due_at: null,
                  ai_active: false
                };
                if (chat.status === 'iniciada') {
                  updates.status = 'interesse em compra';
                }
                if (!chat.assigned_to && inst?.user_id) {
                  updates.assigned_to = inst.user_id;
                }
                chat = await Chat.update(chat.id, updates, companyId);
              }

              const resolvedText = text || (mediaInfo ? `[Mídia: ${mediaInfo.mediaType === 'image' ? 'Imagem' : mediaInfo.mediaType === 'video' ? 'Vídeo' : mediaInfo.mediaType === 'audio' ? 'Áudio' : 'Documento'}]` : '');

              const attendantMsg = {
                id: msg.key?.id,
                sender: 'attendant',
                sender_id: inst?.user_id || chat.assigned_to || null,
                text: resolvedText,
                timestamp: new Date(msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now()),
                is_ai: false,
                media_url: mediaInfo?.mediaUrl,
                media_type: mediaInfo?.mediaType,
                file_name: mediaInfo?.fileName
              };

              await Chat.addMessage(chat.id, attendantMsg);

              const updatedChat = await Chat.findById(chat.id, companyId);
              emitToCompany(companyId, 'chat_updated', updatedChat);
              emitToCompany(companyId, 'chats_updated', await Chat.findForList(companyId));

              continue;
            }

            await handleIncomingWhatsAppMessage(senderJid,
              name,
              text,
              mediaInfo,
              instanceId,
              companyId,
              senderJidAlt
            );

          } catch (msgErr) {
            console.error(
              `[WhatsApp:${instanceId}] Erro ao processar mensagem recebida:`,
              msgErr
            );


            try {
              await Log.add(
                `Erro ao processar mensagem recebida no WhatsApp (${instanceId}): ${msgErr.message}`,
                companyId
              );

            } catch (logErr) {
              console.error(logErr);
            }
          }
        }
      }
    );

  } catch (err) {
    console.error(
      `[WhatsApp:${instanceId}] Erro ao iniciar instância:`,
      err
    );


    if (!activeConnections[instanceId]) {
      activeConnections[instanceId] = {};
    }


    activeConnections[instanceId].connectionStatus =
      'disconnected';

    activeConnections[instanceId].sock =
      null;


    emitToCompany(
      companyId,
      'whatsapp_status_updated',
      {
        instanceId,
        status: 'disconnected',
        qr: null,
        phone: null
      }
    );


    /*
     * Impede vários timers simultâneos.
     */
    if (
      activeConnections[instanceId].reconnectTimer
    ) {
      clearTimeout(
        activeConnections[instanceId].reconnectTimer
      );
    }


    activeConnections[instanceId].reconnectTimer =
      setTimeout(
        () => {
          if (
            activeConnections[instanceId]
          ) {
            activeConnections[
              instanceId
            ].reconnectTimer = null;
          }


          startWhatsAppInstance(
            instanceId,
            companyId
          ).catch((error) => {
            console.error(error);
          });

        },
        10000
      );
  }
}


/**
 * Encerra uma instância WhatsApp.
 */
async function stopWhatsAppInstance(
  instanceId,
  clearSession = false
) {
  const conn =
    activeConnections[instanceId];


  if (conn) {
    /*
     * Cancela reconexão automática.
     */
    if (conn.reconnectTimer) {
      clearTimeout(
        conn.reconnectTimer
      );

      conn.reconnectTimer =
        null;
    }


    /*
     * Guarda referência do socket.
     */
    const sock =
      conn.sock;


    /*
     * Desativa o socket ANTES de chamar logout/end.
     *
     * Dessa forma eventos tardios não conseguem
     * iniciar uma reconexão.
     */
    conn.sock =
      null;

    conn.connectionStatus =
      'disconnected';

    conn.qrCodeImage =
      null;

    conn.connectedPhone =
      null;


    if (sock) {
      try {
        if (clearSession) {
          await sock.logout();
        } else {
          await sock.end();
        }

      } catch (err) {
        console.error(err);
      }
    }


    emitToCompany(
      conn.companyId || 'comp_default',
      'whatsapp_status_updated',
      {
        instanceId,
        status: 'disconnected',
        qr: null,
        phone: null
      }
    );


    delete activeConnections[
      instanceId
    ];
  }


  /*
   * Remove arquivos da sessão somente quando solicitado.
   */
  if (clearSession) {
    const authFolder =
      path.join(
        __dirname,
        `../../auth_info_baileys/${instanceId}`
      );


    if (
      fs.existsSync(authFolder)
    ) {
      fs.rmSync(
        authFolder,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
}

async function sendBotMessage(chat, instanceId, text) {
  await Chat.addMessage(chat.id, { sender: 'attendant', text, timestamp: new Date(), is_ai: true });
  await sendMessage(instanceId, Chat.getRemoteJid(chat), { text });
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

async function handleIncomingWhatsAppMessage(
  rawSenderJid,
  clientName,
  messageText,
  mediaInfo,
  instanceId,
  companyId,
  senderJidAlt = null
) {
  try {
    const senderJid =
      rawSenderJid;

    let chat =
      await Chat.findByRemoteJid(senderJid, companyId, instanceId);

    const isNewChat = !chat;

    let cleanPhone = senderJid.split('@')[0];
    if (senderJid.endsWith('@lid') && senderJidAlt && senderJidAlt.includes('@s.whatsapp.net')) {
      cleanPhone = senderJidAlt.split('@')[0];
    } else if (senderJidAlt && senderJidAlt.includes('@s.whatsapp.net') && !senderJid.endsWith('@s.whatsapp.net')) {
      cleanPhone = senderJidAlt.split('@')[0];
    }

    if (chat && cleanPhone && chat.client_phone !== cleanPhone && (chat.remote_jid?.endsWith('@lid') || chat.client_phone.length > 13)) {
      chat = await Chat.update(chat.id, { client_phone: cleanPhone }, companyId);
    }

    const candidatePhones = new Set();
    const rawClean = (cleanPhone || '').replace(/\D/g, '');
    if (rawClean) {
      candidatePhones.add(rawClean);
      if (rawClean.startsWith('55')) candidatePhones.add(rawClean.slice(2));
      else candidatePhones.add('55' + rawClean);
    }
    const isInternal = await prisma.user.findFirst({
      where: { company_id: companyId, phone: { in: Array.from(candidatePhones) } }
    });
    if (isInternal) return null;

    const isInstance = await prisma.instance.findFirst({
      where: { company_id: companyId, phone: { in: Array.from(candidatePhones) } }
    });
    if (isInstance) return null;

    const inst = await prisma.instance.findUnique({
      where: { id: instanceId },
      select: { id: true, name: true, user_id: true }
    });

    if (!chat) {
      const otherChat = await prisma.chat.findFirst({
        where: {
          company_id: companyId,
          client_phone: { in: Array.from(candidatePhones) }
        },
        orderBy: { updated_at: 'desc' }
      });

      if (otherChat && otherChat.sales_reply_due_at) {
        await Chat.update(otherChat.id, {
          sales_reply_due_at: null,
          status: 'interesse em compra'
        }, companyId);
        await Chat.addMessage(otherChat.id, {
          sender: 'system',
          text: `Cliente respondeu via WhatsApp na conexão ${inst?.name || 'do vendedor'}. Rodízio pausado.`,
          timestamp: new Date()
        });
        const updatedOther = await Chat.findById(otherChat.id, companyId);
        emitToCompany(companyId, 'chat_updated', updatedOther);
      }

      const newChatData = {
        id: Chat.createChatId(companyId, instanceId, senderJid),

        remote_jid:
          senderJid,

        client_name:
          clientName ||
          otherChat?.client_name ||
          `Cliente (+${cleanPhone.slice(-4)})`,

        client_phone:
          cleanPhone,

        status:
          inst?.user_id ? 'interesse em compra' : 'iniciada',

        assigned_to:
          inst?.user_id || otherChat?.assigned_to || null,

        ai_active:
          !inst?.user_id,

        tags:
          otherChat?.tags || [],

        is_favorite:
          false,

        is_archived:
          false,

        is_blocked:
          false,

        waiting_since:
          inst?.user_id ? null : new Date(),

        company_id:
          companyId,

        instance_id:
          instanceId
      };

      chat =
        await Chat.create(
          newChatData,
          companyId
        );

      await Log.add(
        `Novo chat iniciado para o cliente ${chat.client_name} (${cleanPhone}).`,
        companyId
      );

    } else if (
      !chat.waiting_since && !inst?.user_id
    ) {
      chat =
        await Chat.update(
          chat.id,
          {
            waiting_since:
              new Date()
          },
          companyId
        );
    }


    /*
     * Texto exibido quando a mensagem contém apenas mídia.
     */
    const resolvedText =
      messageText ||
      (
        mediaInfo
          ? `[Mídia: ${
              mediaInfo.mediaType === 'image'
                ? 'Imagem'
                : mediaInfo.mediaType === 'video'
                  ? 'Vídeo'
                  : mediaInfo.mediaType === 'audio'
                    ? 'Áudio'
                    : 'Documento'
            }]`
          : ''
      );


    /*
     * Salva mensagem do cliente.
     */
    const clientMsg = {
      sender:
        'client',

      text:
        resolvedText,

      timestamp:
        new Date(),

      is_ai:
        false,

      media_url:
        mediaInfo?.mediaUrl,

      media_type:
        mediaInfo?.mediaType,

      file_name:
        mediaInfo?.fileName
    };


    await Chat.addMessage(
      chat.id,
      clientMsg
    );


    /*
     * Atualiza interface.
     */
    const chatAfterClientMsg =
      await Chat.findById(
        chat.id,
        companyId
      );


    emitToCompany(companyId, 'chat_updated', chatAfterClientMsg);
    emitToCompany(companyId, 'chats_updated', await Chat.findForList(companyId));

    emitToCompany(
      companyId,
      'logs_updated',
      await Log.findAll(companyId)
    );

    /*
     * Não responde chats bloqueados.
     */
    if (chat.is_blocked) {
      return chat;
    }

    if (!inst?.user_id && await runFlow(chat, resolvedText || messageText || '', isNewChat, instanceId, companyId)) {
      const flowChat = await Chat.findById(chat.id, companyId);
      emitToCompany(companyId, 'chat_updated', flowChat);
      emitToCompany(companyId, 'chats_updated', await Chat.findForList(companyId));
      return flowChat;
    }


    /*
     * Mantido da implementação original.
     */
    const company =
      await prisma.company.findUnique({
        where: {
          id: companyId
        }
      });


    /*
     * Configurações da empresa.
     */
    const settings =
      await prisma.settings.findUnique({
        where: {
          company_id:
            companyId
        }
      });


    if (!settings) {
      return chat;
    }


    /*
     * ATENDENTE IA
     */
    if (settings.ai_enabled && !inst?.user_id) {
      /*
       * IA desabilitada para esta conversa.
       */
      if (
        chat.ai_active === false
      ) {
        return chat;
      }


      try {
        /*
         * Estado atualizado do chat.
         */
        const freshChat =
          await Chat.findById(
            chat.id,
            companyId
          );


        /*
         * Executa atendente.
         */
        const aiResponse =
          await aiService.runAiAttendant(
            freshChat,
            resolvedText,
            settings
          );


        /*
         * Registra resposta.
         */
        const aiMsg = {
          sender:
            'attendant',

          text:
            aiResponse.message,

          timestamp:
            new Date(),

          is_ai:
            true
        };


        await Chat.addMessage(
          chat.id,
          aiMsg
        );


        /*
         * Métrica de tempo de resposta.
         */
        if (
          chat.waiting_since
        ) {
          const durationSeconds =
            Math.round(
              (
                new Date() -
                new Date(
                  chat.waiting_since
                )
              ) / 1000
            );


          await Metrics.addResponseTime(
            {
              chatId:
                chat.id,

              attendantId:
                'AI',

              isAi:
                true,

              durationSeconds,

              timestamp:
                new Date(),

              company_id:
                companyId
            },
            companyId
          );


          await Chat.update(
            chat.id,
            {
              waiting_since:
                null
            },
            companyId
          );
        }


        /*
         * Alterações automáticas da conversa.
         */
        const updates = {};


        const oldStatus =
          chat.status;


        if (
          oldStatus === 'iniciada' &&
          aiResponse.status ===
            'interesse em compra'
        ) {
          updates.status =
            aiResponse.status;


          if (
            oldStatus !==
            aiResponse.status
          ) {
            await Log.add(
              `Status do cliente ${chat.client_name} alterado automaticamente pela IA de '${oldStatus}' para '${aiResponse.status}'.`,
              companyId
            );
          }
        }


        /*
         * Handoff para atendente humano.
         */
        if (
          aiResponse.disable_ai === true ||
          aiResponse.status ===
            'transbordo' ||
          (
            aiResponse.message &&
            (
              aiResponse.message
                .toLowerCase()
                .includes(
                  'atendente humano'
                ) ||

              aiResponse.message
                .toLowerCase()
                .includes(
                  'transferir para um atendente'
                )
            )
          )
        ) {
          updates.ai_active =
            false;


          await Chat.addMessage(
            chat.id,
            {
              sender:
                'system',

              text:
                '🚨 Atendimento transferido para atendente humano. IA desativada nesta conversa.',

              timestamp:
                new Date()
            }
          );


          await Log.add(
            `Handoff automático acionado para ${chat.client_name}. IA desativada nesta conversa.`,
            companyId
          );
        }


        /*
         * Salva atualizações.
         */
        if (
          Object.keys(updates).length > 0
        ) {
          await Chat.update(
            chat.id,
            updates,
            companyId,
            undefined,
            {
              source:
                'ai'
            }
          );
        }


        await Log.add(
          `IA respondeu para ${chat.client_name}: "${aiResponse.message.substring(
            0,
            40
          )}..."`,
          companyId
        );


        /*
         * Envia resposta para o MESMO JID
         * armazenado na conversa.
         */
        const conn =
          activeConnections[
            instanceId
          ];


        if (
          conn &&
          conn.connectionStatus ===
            'open' &&
          conn.sock
        ) {
          const remoteJid =
            Chat.getRemoteJid(chat);


          await sendMessage(
            instanceId,
            remoteJid,
            {
              text:
                aiResponse.message
            }
          );
        }

      } catch (err) {
        await Log.add(
          `Erro ao processar IA para ${chat.client_name}: ${err.message}`,
          companyId
        );


        await Chat.addMessage(
          chat.id,
          {
            sender:
              'system',

            text:
              `⚠️ [Erro na API de IA - Provedor: ${settings.ai_provider}]: ${err.message}. Verifique suas configurações e chaves de API no painel.`,

            timestamp:
              new Date()
          }
        );


        const conn =
          activeConnections[
            instanceId
          ];


        if (
          conn &&
          conn.connectionStatus ===
            'open' &&
          conn.sock
        ) {
          try {
            const remoteJid =
              Chat.getRemoteJid(chat);


            await sendMessage(
              instanceId,
              remoteJid,
              {
                text:
                  '⚠️ *Erro no Atendente de IA:* Desculpe, não conseguimos processar sua mensagem devido a um erro técnico temporário. Por favor, tente novamente em alguns instantes.'
              }
            );

          } catch (waErr) {
            console.error(waErr);
          }
        }
      }
    }


    /*
     * Atualização final do frontend.
     */
    const finalChat =
      await Chat.findById(
        chat.id,
        companyId
      );


    emitToCompany(
      companyId,
      'chat_updated',
      finalChat
    );
    emitToCompany(
      companyId,
      'chats_updated',
      await Chat.findForList(companyId)
    );


    emitToCompany(
      companyId,
      'logs_updated',
      await Log.findAll(companyId)
    );


    return finalChat;

  } catch (error) {
    console.error(
      'Error in handleIncomingWhatsAppMessage:',
      error
    );
  }
}


module.exports = {
  startWhatsAppInstance,
  stopWhatsAppInstance,
  sendMessage,
  getActiveConnections,
  handleIncomingWhatsAppMessage
};