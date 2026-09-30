const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');

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
const { decrypt } = require('../utils/crypto');

const activeConnections = {};


/**
 * Envia uma mensagem utilizando exatamente o JID conhecido pelo sistema.
 *
 * IMPORTANTE:
 * Não converter manualmente:
 *
 *   @s.whatsapp.net -> @lid
 *
 * LID é um identificador atribuído pelo WhatsApp e não pode ser obtido
 * simplesmente trocando o domínio do JID.
 */
async function sendMessage(instanceId, jid, content) {
  const conn = activeConnections[instanceId];

  if (
    !conn ||
    conn.connectionStatus !== 'open' ||
    !conn.sock
  ) {
    return null;
  }

  return await conn.sock.sendMessage(jid, content);
}


function getActiveConnections() {
  return activeConnections;
}


/**
 * Inicia uma instância WhatsApp.
 *
 * Existe proteção para impedir que dois sockets sejam criados
 * simultaneamente para a mesma instância.
 */
async function startWhatsAppInstance(instanceId, companyId) {
  const existing = activeConnections[instanceId];

  // Impede múltiplos sockets simultâneos para a mesma instância.
  if (
    existing &&
    ['connecting', 'qr', 'open'].includes(existing.connectionStatus)
  ) {
    return;
  }

  // Cancela qualquer reconexão pendente anterior.
  if (existing?.reconnectTimer) {
    clearTimeout(existing.reconnectTimer);
    existing.reconnectTimer = null;
  }

  const authFolder = path.join(
    __dirname,
    `../../auth_info_baileys/${instanceId}`
  );

  const { state, saveCreds } = await useMultiFileAuthState(authFolder);

  if (!activeConnections[instanceId]) {
    activeConnections[instanceId] = {};
  }

  const connectionState = activeConnections[instanceId];

  connectionState.connectionStatus = 'connecting';
  connectionState.qrCodeImage = null;
  connectionState.connectedPhone = null;
  connectionState.companyId = companyId;
  connectionState.reconnectTimer = null;

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

    connectionState.sock = sock;

    /*
     * Salva atualizações das credenciais do Signal/WhatsApp.
     */
    sock.ev.on('creds.update', saveCreds);


    /*
     * Eventos de conexão.
     */
    sock.ev.on('connection.update', async (update) => {
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
           * Ignora eventos pertencentes a um socket antigo.
           */
          if (activeConnections[instanceId]?.sock !== sock) {
            return;
          }

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


      /*
       * CONEXÃO FECHADA
       */
      if (connection === 'close') {
        /*
         * Se esse evento veio de um socket antigo que já foi substituído,
         * não permitimos que ele altere o estado da instância atual.
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
         * Remove referência ao socket encerrado ANTES da reconexão.
         */
        if (activeConnections[instanceId].sock === sock) {
          activeConnections[instanceId].sock = null;
        }

        activeConnections[instanceId].connectionStatus = 'disconnected';
        activeConnections[instanceId].qrCodeImage = null;
        activeConnections[instanceId].connectedPhone = null;

        emitToCompany(companyId, 'whatsapp_status_updated', {
          instanceId,
          status: 'disconnected',
          qr: null,
          phone: null
        });

        await Instance.updateStatus(
          instanceId,
          'disconnected',
          null,
          companyId
        );

        /*
         * Reconecta somente se não houve logout.
         */
        if (shouldReconnect) {
          if (activeConnections[instanceId].reconnectTimer) {
            clearTimeout(
              activeConnections[instanceId].reconnectTimer
            );
          }

          activeConnections[instanceId].reconnectTimer =
            setTimeout(() => {
              /*
               * Limpa referência ao timer antes da tentativa.
               */
              if (activeConnections[instanceId]) {
                activeConnections[instanceId].reconnectTimer = null;
              }

              startWhatsAppInstance(
                instanceId,
                companyId
              ).catch((err) => {
                console.error(err);
              });
            }, 5000);
        }
      }


      /*
       * CONEXÃO ABERTA
       */
      else if (connection === 'open') {
        /*
         * Não deixa socket antigo assumir a conexão.
         */
        if (activeConnections[instanceId]?.sock !== sock) {
          return;
        }

        const userJid = sock.user.id;

        const phone = userJid
          .split(':')[0]
          .split('@')[0];

        activeConnections[instanceId].connectionStatus = 'open';
        activeConnections[instanceId].connectedPhone = phone;
        activeConnections[instanceId].qrCodeImage = null;

        emitToCompany(companyId, 'whatsapp_status_updated', {
          instanceId,
          status: 'open',
          qr: null,
          phone: phone
        });

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

        const allLogs = await Log.findAll(companyId);

        emitToCompany(
          companyId,
          'logs_updated',
          allLogs
        );
      }
    });


    /*
     * RECEBIMENTO DE MENSAGENS
     */
    sock.ev.on('messages.upsert', async (m) => {
      /*
       * Ignora mensagens provenientes de socket antigo.
       */
      if (activeConnections[instanceId]?.sock !== sock) {
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
          /*
           * Ignora mensagens enviadas pela própria conta e eventos
           * que não representam mensagens novas.
           */
          if (
            msg.key.fromMe ||
            m.type !== 'notify'
          ) {
            continue;
          }

          /*
           * Preservamos EXATAMENTE o remoteJid entregue pelo Baileys.
           *
           * Pode ser:
           *
           *   XXXXX@s.whatsapp.net
           *
           * ou:
           *
           *   XXXXX@lid
           *
           * Não fazemos conversão manual.
           */
          const senderJid = msg.key.remoteJid;

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

          const phone = senderJid.split('@')[0];

          const name =
            msg.pushName ||
            `Cliente (+${phone.slice(-4)})`;


          /*
           * Desempacota mensagens temporárias/view-once.
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

            return message;
          };


          const content =
            getMessageContent(msg.message);

          if (!content) {
            console.warn(
              `[WhatsApp:${instanceId}] Mensagem sem conteudo processavel de ${senderJid}`
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
           * Download de mídia.
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
               * Imagem
               */
              if (imageMsg) {
                mediaType = 'image';

                let rawExt =
                  imageMsg.mimetype
                    ?.split('/')[1] ||
                  'jpg';

                ext = rawExt
                  .split(';')[0]
                  .trim();

                fileName =
                  `image_${Date.now()}.${ext}`;
              }


              /*
               * Vídeo
               */
              else if (videoMsg) {
                mediaType = 'video';

                let rawExt =
                  videoMsg.mimetype
                    ?.split('/')[1] ||
                  'mp4';

                ext = rawExt
                  .split(';')[0]
                  .trim();

                fileName =
                  `video_${Date.now()}.${ext}`;
              }


              /*
               * Áudio
               */
              else if (audioMsg) {
                mediaType = 'audio';

                let rawExt =
                  audioMsg.mimetype
                    ?.split('/')[1] ||
                  'mp3';

                ext = rawExt
                  .split(';')[0]
                  .trim();

                fileName =
                  `audio_${Date.now()}.${ext}`;
              }


              /*
               * Documento
               */
              else if (docMsg) {
                mediaType = 'document';

                fileName =
                  docMsg.fileName ||
                  `doc_${Date.now()}`;

                let rawExt =
                  path.extname(fileName)
                    .slice(1) ||
                  docMsg.mimetype
                    ?.split('/')[1] ||
                  'bin';

                ext = rawExt
                  .split(';')[0]
                  .trim();

                if (!fileName.includes('.')) {
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
              console.error(dlErr);
            }
          }


          /*
           * Ignora mensagens que não possuem conteúdo utilizável.
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


          /*
           * Processa mensagem.
           *
           * senderJid é preservado integralmente.
           */
          await handleIncomingWhatsAppMessage(senderJid,
            name,
            text,
            mediaInfo,
            instanceId,
            companyId
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
    });

  } catch (err) {
    console.error(err);

    /*
     * Só altera estado se a instância ainda existir.
     */
    if (!activeConnections[instanceId]) {
      activeConnections[instanceId] = {};
    }

    activeConnections[instanceId].connectionStatus =
      'disconnected';

    activeConnections[instanceId].sock = null;

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
     * Garante que não existam vários timers simultâneos.
     */
    if (
      activeConnections[instanceId].reconnectTimer
    ) {
      clearTimeout(
        activeConnections[instanceId].reconnectTimer
      );
    }


    activeConnections[instanceId].reconnectTimer =
      setTimeout(() => {
        if (activeConnections[instanceId]) {
          activeConnections[instanceId].reconnectTimer =
            null;
        }

        startWhatsAppInstance(
          instanceId,
          companyId
        ).catch((error) => {
          console.error(error);
        });
      }, 10000);
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

      conn.reconnectTimer = null;
    }


    /*
     * Guarda referência antes de removê-la.
     */
    const sock = conn.sock;

    /*
     * Remove primeiro do controle ativo.
     *
     * Isso impede eventos tardios desse socket de iniciarem
     * uma nova reconexão.
     */
    conn.sock = null;
    conn.connectionStatus = 'disconnected';
    conn.qrCodeImage = null;
    conn.connectedPhone = null;


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


    delete activeConnections[instanceId];
  }


  /*
   * Remove credenciais somente quando solicitado.
   */
  if (clearSession) {
    const authFolder =
      path.join(
        __dirname,
        `../../auth_info_baileys/${instanceId}`
      );

    if (fs.existsSync(authFolder)) {
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


/**
 * Processamento das mensagens recebidas.
 */
async function handleIncomingWhatsAppMessage(
  rawSenderJid,
  clientName,
  messageText,
  mediaInfo,
  instanceId,
  companyId
) {
  try {
    /*
     * Preserva o JID exatamente como recebido pelo Baileys.
     *
     * Isso é especialmente importante para LID.
     */
    const senderJid = rawSenderJid;


    /*
     * Procura conversa pelo remote_jid real.
     */
    let chat =
      await Chat.findByRemoteJid(senderJid, companyId, instanceId);


    const cleanPhone =
      senderJid.split('@')[0];


    /*
     * Cria conversa se ainda não existir.
     */
    if (!chat) {
      const newChatData = {
        id: Chat.createChatId(companyId, instanceId, senderJid),

        remote_jid: senderJid,

        client_name:
          clientName ||
          `Cliente (+${cleanPhone.slice(-4)})`,

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


      chat =
        await Chat.create(
          newChatData,
          companyId
        );


      await Log.add(
        `Novo chat iniciado para o cliente ${chat.client_name} (${cleanPhone}).`,
        companyId
      );
    }

    else if (!chat.waiting_since) {
      chat =
        await Chat.update(
          chat.id,
          {
            waiting_since: new Date()
          },
          companyId
        );
    }


    /*
     * Texto apresentado no chat quando a mensagem contém somente mídia.
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
     * Registra mensagem do cliente.
     */
    const clientMsg = {
      sender: 'client',
      text: resolvedText,
      timestamp: new Date(),
      is_ai: false,
      media_url: mediaInfo?.mediaUrl,
      media_type: mediaInfo?.mediaType,
      file_name: mediaInfo?.fileName
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


    emitToCompany(
      companyId,
      'logs_updated',
      await Log.findAll(companyId)
    );


    /*
     * Chat bloqueado não recebe resposta.
     */
    if (chat.is_blocked) {
      return chat;
    }


    /*
     * Busca empresa.
     *
     * Mantido conforme implementação original.
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
          company_id: companyId
        }
      });


    if (!settings) {
      return chat;
    }


    /*
     * ATENDENTE IA
     */
    if (settings.ai_enabled) {
      if (chat.ai_active === false) {
        return chat;
      }


      try {
        /*
         * Busca estado atualizado da conversa.
         */
        const freshChat =
          await Chat.findById(
            chat.id,
            companyId
          );


        /*
         * Executa atendente IA.
         */
        const aiResponse =
          await aiService.runAiAttendant(
            freshChat,
            resolvedText,
            settings
          );


        /*
         * Registra resposta da IA.
         */
        const aiMsg = {
          sender: 'attendant',
          text: aiResponse.message,
          timestamp: new Date(),
          is_ai: true
        };


        await Chat.addMessage(
          chat.id,
          aiMsg
        );


        /*
         * Métrica de tempo de resposta.
         */
        if (chat.waiting_since) {
          const durationSeconds =
            Math.round(
              (
                new Date() -
                new Date(chat.waiting_since)
              ) / 1000
            );


          await Metrics.addResponseTime({
            chatId: chat.id,
            attendantId: 'AI',
            isAi: true,
            durationSeconds,
            timestamp: new Date(),
            company_id: companyId
          }, companyId);


          await Chat.update(
            chat.id,
            {
              waiting_since: null
            },
            companyId
          );
        }


        /*
         * Atualizações automáticas da conversa.
         */
        const updates = {};

        const oldStatus =
          chat.status;


        if (
          oldStatus === 'iniciada' &&
          aiResponse.status === 'interesse em compra'
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
         * Handoff para humano.
         */
        if (
          aiResponse.disable_ai === true ||
          aiResponse.status === 'transbordo' ||
          (
            aiResponse.message &&
            (
              aiResponse.message
                .toLowerCase()
                .includes('atendente humano') ||

              aiResponse.message
                .toLowerCase()
                .includes(
                  'transferir para um atendente'
                )
            )
          )
        ) {
          updates.ai_active = false;


          await Chat.addMessage(
            chat.id,
            {
              sender: 'system',
              text:
                '🚨 Atendimento transferido para atendente humano. IA desativada nesta conversa.',
              timestamp: new Date()
            }
          );


          await Log.add(
            `Handoff automático acionado para ${chat.client_name}. IA desativada nesta conversa.`,
            companyId
          );
        }


        /*
         * Salva alterações.
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
              source: 'ai'
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
         * Envia resposta utilizando exatamente o JID armazenado.
         *
         * NÃO converte @s.whatsapp.net para @lid.
         */
        const conn =
          activeConnections[instanceId];


        if (
          conn &&
          conn.connectionStatus === 'open' &&
          conn.sock
        ) {
          await conn.sock.sendMessage(
            Chat.getRemoteJid(chat),
            {
              text: aiResponse.message
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
            sender: 'system',
            text:
              `⚠️ [Erro na API de IA - Provedor: ${settings.ai_provider}]: ${err.message}. Verifique suas configurações e chaves de API no painel.`,
            timestamp: new Date()
          }
        );


        const conn =
          activeConnections[instanceId];


        if (
          conn &&
          conn.connectionStatus === 'open' &&
          conn.sock
        ) {
          try {
            await conn.sock.sendMessage(
              Chat.getRemoteJid(chat),
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
     * Atualiza conversa final no frontend.
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