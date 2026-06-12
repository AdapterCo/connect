const path = require('path');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Log = require('../models/Log');
const Metrics = require('../models/Metrics');
const { prisma } = require('../config/database');
const { emitToCompany } = require('../config/socket');

async function getChats(req, res) {
  try {
    const chats = await Chat.findAll(req.user.company_id);
    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar conversas.' });
  }
}

async function getChatById(req, res) {
  try {
    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado.' });
    }
    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar conversa.' });
  }
}

async function createChat(req, res) {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Nome e telefone são obrigatórios.' });
    }

    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
    const cleanPhone = phone.split('@')[0];

    const existing = await Chat.findById(jid, req.user.company_id);
    if (existing) {
      return res.status(400).json({ error: 'Cliente com este identificador já cadastrado nesta empresa.' });
    }

    const defaultInst = await prisma.instance.findFirst({
      where: { company_id: req.user.company_id }
    });

    const newChat = {
      id: jid,
      client_name: name,
      client_phone: cleanPhone,
      status: 'iniciada',
      tags: [],
      is_favorite: false,
      is_archived: false,
      is_blocked: false,
      sector: null,
      company_id: req.user.company_id,
      instance_id: defaultInst ? defaultInst.id : 'inst_default'
    };

    const createdChat = await Chat.create(newChat, req.user.company_id);

    await Chat.addMessage(createdChat.id, {
      sender: 'system',
      text: `Chat criado manualmente para o cliente ${name}.`,
      timestamp: new Date(),
      is_ai: false
    });

    await Log.add(`Cliente ${name} (+${cleanPhone}) adicionado ao CRM.`, req.user.company_id);

    const allChats = await Chat.findAll(req.user.company_id);
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
    await Chat.remove(req.params.id, req.user.company_id);
    await Log.add(`Cliente ${clientName} excluído do CRM.`, req.user.company_id);

    const allChats = await Chat.findAll(req.user.company_id);
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
    if (!['iniciada', 'interesse em compra', 'finalizada'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado.' });
    }

    const oldStatus = chat.status;
    const updates = { status };

    if (status === 'finalizada' && chat.claimed_at) {
      const durationSeconds = Math.round((new Date() - new Date(chat.claimed_at)) / 1000);
      await Metrics.addAttendanceTime({
        chatId: chat.id,
        attendantId: chat.assigned_to,
        durationSeconds,
        timestamp: new Date(),
        company_id: chat.company_id
      }, req.user.company_id);
      updates.claimed_at = null;
    }

    const updated = await Chat.update(req.params.id, updates, req.user.company_id);
    await Log.add(`Status do cliente ${chat.client_name} alterado manualmente de '${oldStatus}' para '${status}'.`, req.user.company_id);

    const allChats = await Chat.findAll(req.user.company_id);
    const allLogs = await Log.findAll(req.user.company_id);

    emitToCompany(req.user.company_id, 'chats_updated', allChats);
    emitToCompany(req.user.company_id, 'logs_updated', allLogs);

    res.json({ success: true, chat: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar status.' });
  }
}

async function sendMessage(req, res) {
  try {
    const { text, isNote, mediaUrl, mediaType, fileName } = req.body;
    if (!text && !mediaUrl) {
      return res.status(400).json({ error: 'Mensagem vazia.' });
    }

    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Chat não encontrado.' });
    }

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

    const createdMsg = await Chat.addMessage(chat.id, newMessage);

    if (!isNote) {
      const instanceId = chat.instance_id || 'inst_default';
      const { sendMessage, getActiveConnections } = require('../services/whatsappService');
      const activeConns = getActiveConnections();
      const conn = activeConns[instanceId];

      let messageSent = false;

      if (conn && conn.connectionStatus === 'open' && conn.sock) {
        try {
          if (mediaUrl) {
            const mediaPath = path.join(__dirname, '../../public', mediaUrl);
            if (mediaType === 'image') {
              await sendMessage(instanceId, chat.id, { image: { url: mediaPath }, caption: text || undefined });
            } else if (mediaType === 'video') {
              await sendMessage(instanceId, chat.id, { video: { url: mediaPath }, caption: text || undefined });
            } else if (mediaType === 'audio') {
              await sendMessage(instanceId, chat.id, { audio: { url: mediaPath }, mimetype: 'audio/mp4', ptt: true });
            } else if (mediaType === 'document') {
              await sendMessage(instanceId, chat.id, { 
                document: { url: mediaPath }, 
                mimetype: 'application/octet-stream', 
                fileName: fileName || 'Arquivo' 
              });
            } else {
              await sendMessage(instanceId, chat.id, { text: text });
            }
            messageSent = true;
          } else {
            await sendMessage(instanceId, chat.id, { text: text });
            messageSent = true;
          }
        } catch (err) {
          console.error('Erro ao enviar mensagem via WhatsApp:', err);
        }
      } else {
        const connKeys = Object.keys(activeConns);
        console.warn(`[chatController] Conexão WhatsApp não disponível para instance_id="${instanceId}". Conexões ativas: [${connKeys.join(', ')}]`);
      }

      if (!messageSent && !conn) {
        const fallbackInstance = Object.keys(activeConns).find(k => activeConns[k]?.connectionStatus === 'open' && activeConns[k]?.sock);
        if (fallbackInstance) {
          try {
            if (mediaUrl) {
              const mediaPath = path.join(__dirname, '../../public', mediaUrl);
              await sendMessage(fallbackInstance, chat.id, { image: { url: mediaPath }, caption: text || undefined });
            } else {
              await sendMessage(fallbackInstance, chat.id, { text: text });
            }
            messageSent = true;
          } catch (err) {
            console.error('Erro ao enviar via conexão fallback:', err);
          }
        }
      }
    }

    const allChats = await Chat.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'chats_updated', allChats);

    res.json({ success: true, message: { ...createdMsg, timestamp: createdMsg.timestamp.toISOString() } });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao enviar mensagem.' });
  }
}

async function assignChat(req, res) {
  try {
    const { userId } = req.body;
    
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

    const updated = await Chat.update(req.params.id, updates, req.user.company_id);
    
    const assignedName = assignedUser ? assignedUser.name : 'Ninguém (Fila de Espera)';
    await Log.add(`Conversa de ${chat.client_name} atribuída a: ${assignedName} (por: ${req.user.name}).`, req.user.company_id);

    const allChats = await Chat.findAll(req.user.company_id);
    const allLogs = await Log.findAll(req.user.company_id);

    emitToCompany(req.user.company_id, 'chats_updated', allChats);
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

    const allChats = await Chat.findAll(req.user.company_id);
    const allLogs = await Log.findAll(req.user.company_id);

    emitToCompany(req.user.company_id, 'chats_updated', allChats);
    emitToCompany(req.user.company_id, 'logs_updated', allLogs);

    res.json({ success: true, chat: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao alterar status de IA.' });
  }
}

async function addTag(req, res) {
  try {
    const { tag } = req.body;
    if (!tag) {
      return res.status(400).json({ error: 'Tag é obrigatória.' });
    }

    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    const currentTags = chat.tags || [];
    if (!currentTags.includes(tag)) {
      currentTags.push(tag);
    }

    const updated = await Chat.update(req.params.id, { tags: currentTags }, req.user.company_id);
    await Log.add(`Tag "${tag}" adicionada ao cliente ${chat.client_name} por ${req.user.name}.`, req.user.company_id);

    const allChats = await Chat.findAll(req.user.company_id);
    const allLogs = await Log.findAll(req.user.company_id);

    emitToCompany(req.user.company_id, 'chats_updated', allChats);
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

    const allChats = await Chat.findAll(req.user.company_id);
    const allLogs = await Log.findAll(req.user.company_id);

    emitToCompany(req.user.company_id, 'chats_updated', allChats);
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

    const allChats = await Chat.findAll(req.user.company_id);
    const allLogs = await Log.findAll(req.user.company_id);

    emitToCompany(req.user.company_id, 'chats_updated', allChats);
    emitToCompany(req.user.company_id, 'logs_updated', allLogs);

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

    const allChats = await Chat.findAll(req.user.company_id);
    const allLogs = await Log.findAll(req.user.company_id);

    emitToCompany(req.user.company_id, 'chats_updated', allChats);
    emitToCompany(req.user.company_id, 'logs_updated', allLogs);

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

    const updated = await Chat.update(req.params.id, updates, req.user.company_id);
    await Log.add(`Contato ${chat.client_name} foi ${updated.is_blocked ? 'BLOQUEADO' : 'DESBLOQUEADO'} por ${req.user.name}.`, req.user.company_id);

    const allChats = await Chat.findAll(req.user.company_id);
    const allLogs = await Log.findAll(req.user.company_id);

    emitToCompany(req.user.company_id, 'chats_updated', allChats);
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

    const allChats = await Chat.findAll(req.user.company_id);
    const allLogs = await Log.findAll(req.user.company_id);

    emitToCompany(req.user.company_id, 'chats_updated', allChats);
    emitToCompany(req.user.company_id, 'logs_updated', allLogs);

    res.json({ success: true, chat: updated });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao alterar setor.' });
  }
}

module.exports = {
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
