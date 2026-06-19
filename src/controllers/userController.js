const User = require('../models/User');
const Chat = require('../models/Chat');
const Log = require('../models/Log');
const { emitToCompany } = require('../config/socket');
const { prisma } = require('../config/database');

async function listUsers(req, res) {
  try {
    const users = await User.findAll(req.user.company_id);
    const safeUsers = users.map(u => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      status: u.status,
      company_id: u.company_id
    }));
    res.json(safeUsers);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar atendentes.' });
  }
}

async function deleteUser(req, res) {
  try {
    const isAdminOrSupervisor = req.user.role === 'admin' || req.user.role === 'supervisor';
    if (!isAdminOrSupervisor) {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores ou supervisores podem excluir atendentes.' });
    }

    const userId = req.params.id;
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Você não pode excluir sua própria conta.' });
    }

    const targetUser = await User.findById(userId, req.user.company_id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Atendente não encontrado.' });
    }

    if (req.user.role === 'supervisor' && ['admin', 'supervisor'].includes(targetUser.role)) {
      return res.status(403).json({ error: 'Acesso negado. Supervisores não podem excluir Administradores ou outros Supervisores.' });
    }

    const userName = targetUser.name;
    await User.remove(userId, req.user.company_id);

    await prisma.chat.updateMany({
      where: { assigned_to: userId, company_id: req.user.company_id },
      data: { assigned_to: null }
    });

    await Log.add(`Atendente ${userName} excluído pelo administrador/supervisor ${req.user.name}.`, req.user.company_id);
    
    const allUsers = await User.findAll(req.user.company_id);
    const allChats = await Chat.findAll(req.user.company_id);

    emitToCompany(req.user.company_id, 'users_updated', allUsers);
    emitToCompany(req.user.company_id, 'chats_updated', allChats);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir atendente.' });
  }
}

async function revokeSessions(req, res) {
  try {
    const userId = req.params.id;
    const targetUser = await User.findById(userId, req.user.company_id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Atendente nao encontrado.' });
    }

    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({ error: 'Apenas administradores podem revogar sessoes de outros usuarios.' });
    }

    await prisma.user.updateMany({
      where: { id: userId, company_id: req.user.company_id },
      data: { session_version: { increment: 1 }, status: 'offline' }
    });

    await Log.add(`Sessoes do atendente ${targetUser.name} revogadas por ${req.user.name}.`, req.user.company_id);

    const allUsers = await User.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'users_updated', allUsers);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao revogar sessoes.' });
  }
}

module.exports = {
  listUsers,
  deleteUser,
  revokeSessions
};
