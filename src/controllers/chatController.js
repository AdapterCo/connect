const path = require('path');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Log = require('../models/Log');
const Metrics = require('../models/Metrics');
const { prisma } = require('../config/database');
const { emitToCompany } = require('../config/socket');

async function getChats(req, res) {
  try {
    const chats = await Chat.findForList(req.user.company_id, ['admin', 'supervisor'].includes(req.user.role) ? null : req.user);
    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar conversas.' });
  }
}

async function getChatById(req, res) {
  try {
    const chat = await Chat.findById(req.params.id, req.user.company_id, 51);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado.' });
    }
    const messages = chat.messages || [];
    res.json({ ...chat, messages: messages.slice(0, 50).reverse(), history_has_more: messages.length > 50 });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar conversa.' });
  }
}

async function createChat(req, res) {
  try {
    if (typeof req.body.name !== 'string' || typeof req.body.phone !== 'string') {
      return res.status(400).json({ error: 'Nome e telefone são obrigatórios.' });
    }
    const name = req.body.name.trim().slice(0, 100);
    // Apenas numeros de contato individuais (DDI + DDD + numero); nao aceita
    // JIDs arbitrarios como grupos ou listas de transmissao.
    const cleanPhone = req.body.phone.replace(/\D/g, '');
    if (!name || !/^\d{10,15}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Informe o nome e o telefone com DDI e DDD (10 a 15 dígitos).' });
    }

    const jid = `${cleanPhone}@s.whatsapp.net`;

    const isManager = ['admin', 'supervisor'].includes(req.user.role);
    const userInstance = !isManager
      ? await prisma.instance.findFirst({ where: { company_id: req.user.company_id, user_id: req.user.id } })
      : null;

    if (req.user.role === 'seller' && !userInstance) return res.status(403).json({ error: 'Vendedor precisa de uma conexao propria para criar conversas.' });
    let instanceId;
    if (userInstance) {
      instanceId = userInstance.id;
    } else {
      const defaultInst = await prisma.instance.findFirst({
        where: { company_id: req.user.company_id }
      });
      instanceId = defaultInst ? defaultInst.id : 'inst_default';
    }

    const userSector = req.user.sector || (req.user.role === 'seller' ? 'sales' : (req.user.role === 'support' ? 'support' : null));

    const existing = await Chat.findByRemoteJid(jid, req.user.company_id, instanceId);
    if (existing) {
      return res.status(400).json({ error: 'Cliente com este identificador já cadastrado nesta empresa.' });
    }

    const newChat = {
      assigned_to: req.user.id,
      id: Chat.createChatId(req.user.company_id, instanceId, jid),
      remote_jid: jid,
      client_name: name,
      client_phone: cleanPhone,
      status: 'iniciada',
      tags: [],
      is_favorite: false,
      is_archived: false,
      is_blocked: false,
      sector: userSector || null,
      company_id: req.user.company_id,
      instance_id: instanceId
    };

    const createdChat = await Chat.create(newChat, req.user.company_id);

    await Chat.addMessage(createdChat.id, {
      sender: 'system',
      text: `Chat criado manualmente para o cliente ${name}.`,
      timestamp: new Date(),
      is_ai: false
    });

    await Log.add(`Cliente ${name} (+${cleanPhone}) adicionado ao CRM.`, req.user.company_id);

    // PERFORMANCE: Para novo chat emitir lista completa (necessário para sidebar mostrar novo item)
    const allChats = await Chat.findForList(req.user.company_id);
    const allLogs = await Log.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'chats_updated', allChats);
    emitToCompany(req.user.company_id, 'logs_updated', allLogs);

    const finalChat = await Chat.findById(createdChat.id, req.user.company_id);
    res.json({ success: true, chat: finalChat });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar conversa.' });
  }
}

async function deleteChat(req, res) {
  try {
    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const clientName = chat.client_name;
    const [media, schedules] = await Promise.all([prisma.message.findMany({ where: { chat_id: chat.id }, select: { media_url: true } }), prisma.scheduledMessage.findMany({ where: { chat_id: chat.id }, select: { media_url: true } })]);
    await prisma.$transaction(async tx => {
      await require('../services/mediaCleanupService').enqueue(tx, [...media, ...schedules].map(m => m.media_url));
      await tx.scheduledMessage.deleteMany({ where: { chat_id: chat.id, company_id: req.user.company_id } });
      await tx.chat.deleteMany({ where: { id: chat.id, company_id: req.user.company_id } });
    });
    await Log.add(`Cliente ${clientName} excluído do CRM.`, req.user.company_id);

    // PERFORMANCE: Para remoção de chat emitir lista completa (necessário para sidebar remover item)
    const allChats = await Chat.findForList(req.user.company_id);
    const allLogs = await Log.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'chats_updated', allChats);
    emitToCompany(req.user.company_id, 'logs_updated', allLogs);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir conversa.' });
  }
}

async function updateStatus(req, res) {
  try {
    const { status } = req.body;
    if (!['iniciada', 'interesse em compra', 'encaminhados', 'em atendimento', 'finalizada'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado.' });
    }

    const oldStatus = chat.status;
    const updates = { status };

    const updated = await Chat.update(req.params.id, updates, req.user.company_id, req.user);
    await Log.add(`Status do cliente ${chat.client_name} alterado manualmente de '${oldStatus}' para '${status}'.`, req.user.company_id);

    // PERFORMANCE: Emitir apenas o chat atualizado, não a lista completa
    emitToCompany(req.user.company_id, 'chat_updated', updated);
    const allLogs = await Log.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'logs_updated', allLogs);

    res.json({ success: true, chat: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar status.' });
  }
}

async function sendMessage(req, res) {
  try {
    const { text, isNote, mediaUrl, mediaType, fileName } = req.body;
    if (mediaUrl) { try { if (!await require('../utils/media').canAccessMedia(req.user, mediaUrl)) return res.status(404).json({ error: 'Midia indisponivel.' }); } catch { return res.status(400).json({ error: 'Midia invalida.' }); } }
    if (!text && !mediaUrl) {
      return res.status(400).json({ error: 'Mensagem vazia.' });
    }

    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado.' });
    }

    const newMessage = {
      sender: 'attendant',
      sender_id: req.user.id,
      text: text || '',
      timestamp: new Date(),
      is_ai: false,
      is_note: !!isNote,
      media_url: mediaUrl || undefined,
      media_type: mediaType || undefined,
      file_name: fileName || undefined
    };

    if (!isNote) {
      const whatsappService = require('../services/whatsappService');
      const activeConns = whatsappService.getActiveConnections();
      let instanceId = chat.instance_id || 'inst_default';
      const companyId = req.user.company_id;

      const activeInstanceId = instanceId;
      const conn = activeConns[activeInstanceId];
      if (!conn?.sock || conn.connectionStatus !== 'open' || conn.companyId !== companyId) {
        return res.status(503).json({ error: 'A conexao original desta conversa esta desconectada.' });
      }
      try {
        const jid = Chat.getRemoteJid(chat);
        if (mediaUrl) {
          const mediaPath = require('../utils/media').mediaPath(mediaUrl);
          if (mediaType === 'image') {
            await whatsappService.sendMessage(activeInstanceId, jid, { image: { url: mediaPath }, caption: text || undefined });
          } else if (mediaType === 'video') {
            await whatsappService.sendMessage(activeInstanceId, jid, { video: { url: mediaPath }, caption: text || undefined });
          } else if (mediaType === 'audio') {
            await whatsappService.sendMessage(activeInstanceId, jid, { audio: { url: mediaPath }, mimetype: 'audio/mp4', ptt: true });
          } else if (mediaType === 'document') {
            await whatsappService.sendMessage(activeInstanceId, jid, {
              document: { url: mediaPath },
              mimetype: 'application/octet-stream',
              fileName: fileName || 'Arquivo'
            });
          } else {
            await whatsappService.sendMessage(activeInstanceId, jid, { text: text });
          }
        } else {
          await whatsappService.sendMessage(activeInstanceId, jid, { text: text });
        }
      } catch (err) {
        console.error('Erro ao enviar mensagem via WhatsApp:', err);
        return res.status(502).json({ error: 'Não foi possível enviar a mensagem pelo WhatsApp. Verifique a conexão e tente novamente.' });
      }
    }

    const createdMsg = await Chat.addMessage(chat.id, newMessage);

    // Um atendente assumiu a conversa: o fluxo automatico nao responde mais.
    if (!isNote) await require('../services/flowService').cancelForHuman(chat.id);

    if (!isNote && chat.waiting_since) {
      const durationSeconds = Math.round((new Date() - new Date(chat.waiting_since)) / 1000);
      await Metrics.addResponseTime({
        chatId: chat.id,
        attendantId: req.user.id,
        isAi: false,
        durationSeconds,
        timestamp: new Date(),
        company_id: chat.company_id
      }, req.user.company_id);
      await Chat.update(chat.id, { waiting_since: null }, req.user.company_id);
    }
    // PERFORMANCE: Emitir apenas o chat afetado, não toda a lista
    const updatedChat = await Chat.findById(chat.id, req.user.company_id);
    emitToCompany(req.user.company_id, 'chat_updated', updatedChat);

    res.json({ success: true, message: { ...createdMsg, timestamp: createdMsg.timestamp.toISOString() } });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
}

async function assignChat(req, res) {
  try {
    const { userId, reason } = req.body;
    if (reason !== undefined && (typeof reason !== 'string' || reason.length > 500)) return res.status(400).json({ error: 'Motivo invalido.' });
    if (!['admin', 'supervisor'].includes(req.user.role) && userId !== req.user.id) return res.status(403).json({ error: 'Sem permissao para transferir conversas.' });

    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    const assignedUser = userId ? await User.findById(userId, req.user.company_id) : null;
    if (userId && !assignedUser) {
      return res.status(400).json({ error: 'Atendente não encontrado.' });
    }

    const updates = {
      assigned_to: userId || null,
      claimed_at: userId ? new Date() : null
    };

    const updated = await Chat.update(req.params.id, updates, req.user.company_id, req.user);

    if (reason?.trim()) await Chat.addMessage(chat.id, { sender: 'attendant', sender_id: req.user.id, text: 'Transferencia: ' + reason.trim(), is_note: true });
    const assignedName = assignedUser ? assignedUser.name : 'Ninguém (Fila de Espera)';
    await Log.add(`Conversa de ${chat.client_name} atribuída a: ${assignedName} (por: ${req.user.name}).`, req.user.company_id);

    // PERFORMANCE: Emitir apenas o chat atualizado
    emitToCompany(req.user.company_id, 'chat_updated', updated);
    const allLogs = await Log.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'logs_updated', allLogs);

    res.json({ success: true, chat: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atribuir conversa.' });
  }
}

async function toggleAi(req, res) {
  try {
    const { aiActive } = req.body;
    if (aiActive === undefined) {
      return res.status(400).json({ error: 'Status da IA é obrigatório.' });
    }

    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    const updated = await Chat.update(req.params.id, { ai_active: !!aiActive }, req.user.company_id);
    await Log.add(`IA do atendente virtual para ${chat.client_name} foi ${updated.ai_active ? 'ativada' : 'desativada'} por ${req.user.name}.`, req.user.company_id);

    // PERFORMANCE: Emitir apenas o chat atualizado
    emitToCompany(req.user.company_id, 'chat_updated', updated);
    const allLogs = await Log.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'logs_updated', allLogs);

    res.json({ success: true, chat: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao alterar status de IA.' });
  }
}

async function addTag(req, res) {
  try {
    const tag = typeof req.body.tag === 'string' ? req.body.tag.trim() : '';
    if (!tag || tag.length > 40) {
      return res.status(400).json({ error: 'Tag deve ter entre 1 e 40 caracteres.' });
    }

    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    const currentTags = chat.tags || [];
    if (!currentTags.includes(tag) && currentTags.length >= 30) {
      return res.status(400).json({ error: 'Limite de 30 tags por conversa.' });
    }
    if (!currentTags.includes(tag)) {
      currentTags.push(tag);
    }

    const updated = await Chat.update(req.params.id, { tags: currentTags }, req.user.company_id);
    await Log.add(`Tag "${tag}" adicionada ao cliente ${chat.client_name} por ${req.user.name}.`, req.user.company_id);

    // PERFORMANCE: Emitir apenas o chat atualizado
    emitToCompany(req.user.company_id, 'chat_updated', updated);
    const allLogs = await Log.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'logs_updated', allLogs);

    res.json({ success: true, chat: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar tag.' });
  }
}

async function deleteTag(req, res) {
  try {
    const { tag } = req.body;
    if (!tag) {
      return res.status(400).json({ error: 'Tag é obrigatória.' });
    }

    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    const currentTags = (chat.tags || []).filter(t => t !== tag);
    const updated = await Chat.update(req.params.id, { tags: currentTags }, req.user.company_id);
    await Log.add(`Tag "${tag}" removida do cliente ${chat.client_name} por ${req.user.name}.`, req.user.company_id);

    // PERFORMANCE: Emitir apenas o chat atualizado
    emitToCompany(req.user.company_id, 'chat_updated', updated);
    const allLogs = await Log.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'logs_updated', allLogs);

    res.json({ success: true, chat: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir tag.' });
  }
}

async function toggleFavorite(req, res) {
  try {
    const { isFavorite } = req.body;
    if (isFavorite === undefined) {
      return res.status(400).json({ error: 'Estado de favorito obrigatório.' });
    }

    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    const updated = await Chat.update(req.params.id, { is_favorite: !!isFavorite }, req.user.company_id);
    await Log.add(`Conversa de ${chat.client_name} foi ${updated.is_favorite ? 'marcada como favorita' : 'desmarcada como favorita'} por ${req.user.name}.`, req.user.company_id);

    // PERFORMANCE: Emitir apenas o chat atualizado
    emitToCompany(req.user.company_id, 'chat_updated', updated);

    res.json({ success: true, chat: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao alterar estado de favorito.' });
  }
}

async function toggleArchive(req, res) {
  try {
    const { isArchived } = req.body;
    if (isArchived === undefined) {
      return res.status(400).json({ error: 'Estado de arquivado obrigatório.' });
    }

    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    const updated = await Chat.update(req.params.id, { is_archived: !!isArchived }, req.user.company_id);
    await Log.add(`Conversa de ${chat.client_name} foi ${updated.is_archived ? 'arquivada' : 'desarquivada'} por ${req.user.name}.`, req.user.company_id);

    // PERFORMANCE: Emitir apenas o chat atualizado
    emitToCompany(req.user.company_id, 'chat_updated', updated);

    res.json({ success: true, chat: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao alterar estado de arquivado.' });
  }
}

async function toggleBlock(req, res) {
  try {
    const { isBlocked } = req.body;
    if (isBlocked === undefined) {
      return res.status(400).json({ error: 'Estado de bloqueado obrigatório.' });
    }

    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    const updates = { is_blocked: !!isBlocked };
    if (updates.is_blocked) {
      updates.ai_active = false;
    }

    const updated = await Chat.update(req.params.id, updates, req.user.company_id, req.user);
    await Log.add(`Contato ${chat.client_name} foi ${updated.is_blocked ? 'BLOQUEADO' : 'DESBLOQUEADO'} por ${req.user.name}.`, req.user.company_id);

    // PERFORMANCE: Emitir apenas o chat atualizado
    emitToCompany(req.user.company_id, 'chat_updated', updated);
    const allLogs = await Log.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'logs_updated', allLogs);

    res.json({ success: true, chat: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao alterar estado de bloqueado.' });
  }
}

async function updateSector(req, res) {
  try {
    const { sector } = req.body;
    if (sector !== null && !['sales', 'support', 'finance'].includes(sector)) {
      return res.status(400).json({ error: 'Setor inválido.' });
    }

    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    const updated = await Chat.update(req.params.id, { sector }, req.user.company_id);
    const sectorName = sector ? (sector === 'sales' ? 'Vendas' : (sector === 'support' ? 'Suporte' : 'Financeiro')) : 'Nenhum';
    await Log.add(`Setor da conversa de ${chat.client_name} alterado para: ${sectorName} por ${req.user.name}.`, req.user.company_id);

    // PERFORMANCE: Emitir apenas o chat atualizado
    emitToCompany(req.user.company_id, 'chat_updated', updated);
    const allLogs = await Log.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'logs_updated', allLogs);

    res.json({ success: true, chat: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao alterar setor.' });
  }
}

// Respostas captadas pelo fluxo de atendimento nesta conversa.
async function getFlowSession(req, res) {
  try {
    const session = await prisma.flowSession.findFirst({
      where: { chat_id: req.params.id, company_id: req.user.company_id },
      select: { flow_name: true, status: true, variables: true, started_at: true, finished_at: true }
    });
    res.json(session || null);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar respostas do fluxo.' });
  }
}

module.exports = {
  getFlowSession,
  getChats,
  getChatById,
  createChat,
  deleteChat,
  updateStatus,
  sendMessage,
  assignChat,
  toggleAi,
  addTag,
  deleteTag,
  toggleFavorite,
  toggleArchive,
  toggleBlock,
  updateSector
};

async function getChatMessages(req, res) {
  try {
    const where = { chat_id: req.params.id };
    if (req.query.before) {
      const cursor = await prisma.message.findFirst({ where: { id: String(req.query.before), chat_id: req.params.id } });
      if (!cursor) return res.status(400).json({ error: 'Cursor de historico invalido.' });
      where.OR = [{ timestamp: { lt: cursor.timestamp } }, { timestamp: cursor.timestamp, id: { lt: cursor.id } }];
    }
    const messages = await prisma.message.findMany({ where, orderBy: [{ timestamp: 'desc' }, { id: 'desc' }], take: 51 });
    res.json({ messages: messages.slice(0, 50).reverse(), has_more: messages.length > 50 });
  } catch { res.status(500).json({ error: 'Erro ao carregar historico.' }); }
}
module.exports.getChatMessages = getChatMessages;
