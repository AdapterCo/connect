const User = require('../models/User');
const Chat = require('../models/Chat');
const Log = require('../models/Log');
const { emitToCompany, disconnectUser } = require('../config/socket');
const { prisma } = require('../config/database');
const { normalizeEmail } = require('../middleware/validationMiddleware');

async function listUsers(req, res) {
  try {
    const users = await User.findAll(req.user.company_id);
    const manager = ['admin', 'supervisor'].includes(req.user.role);
    const safeUsers = users.map(u => ({
      id: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      sector: u.sector || (u.role === 'seller' ? 'sales' : (u.role === 'support' ? 'support' : (u.role === 'other' ? 'finance' : null))),
      status: u.status,
      company_id: u.company_id,
      ...(manager || u.id === req.user.id ? { email: u.email || null, phone: u.phone || null } : {})
    }));
    res.json(safeUsers);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar atendentes.' });
  }
}

// Define o e-mail usado na recuperacao de senha. O proprio usuario pode alterar
// o seu; admin altera qualquer um da empresa; supervisor so de quem nao e gestor.
async function updateEmail(req, res) {
  try {
    const { email, error } = normalizeEmail(req.body.email);
    if (error) return res.status(400).json({ error });

    const target = await User.findById(req.params.id, req.user.company_id);
    if (!target) return res.status(404).json({ error: 'Atendente não encontrado.' });

    const self = target.id === req.user.id;
    const allowed = self || req.user.role === 'admin' ||
      (req.user.role === 'supervisor' && !['admin', 'supervisor'].includes(target.role));
    if (!allowed) return res.status(403).json({ error: 'Sem permissão para alterar o e-mail deste usuário.' });

    if (email && await prisma.user.findFirst({ where: { email, id: { not: target.id } }, select: { id: true } })) {
      return res.status(400).json({ error: 'Este e-mail já está em uso.' });
    }

    await prisma.user.updateMany({ where: { id: target.id, company_id: req.user.company_id }, data: { email } });
    await Log.add(`E-mail de ${target.name} ${email ? 'atualizado' : 'removido'} por ${req.user.name}.`, req.user.company_id);
    res.json({ success: true, email });
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Este e-mail já está em uso.' });
    res.status(500).json({ error: 'Erro ao atualizar e-mail.' });
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

    if (await prisma.product.count({ where: { seller_id: userId, company_id: req.user.company_id } })) return res.status(409).json({ error: 'Vendedor possui produtos ou vendas vinculados.' });
    const userName = targetUser.name;

    // Libera as conversas e remove o usuario juntos: nenhuma conversa fica
    // atribuida a um usuario inexistente se uma das etapas falhar.
    await prisma.$transaction(async (tx) => {
      await tx.chat.updateMany({
        where: { assigned_to: userId, company_id: req.user.company_id },
        data: { assigned_to: null }
      });
      await tx.user.deleteMany({ where: { id: userId, company_id: req.user.company_id } });
    });
    disconnectUser(userId);

    await Log.add(`Atendente ${userName} excluído pelo administrador/supervisor ${req.user.name}.`, req.user.company_id);
    
    const allUsers = await User.findAll(req.user.company_id);
    const allChats = await Chat.findForList(req.user.company_id);

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
    disconnectUser(userId);

    await Log.add(`Sessoes do atendente ${targetUser.name} revogadas por ${req.user.name}.`, req.user.company_id);

    const allUsers = await User.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'users_updated', allUsers);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao revogar sessoes.' });
  }
}

async function updatePhone(req, res) {
  try {
    const { normalizeDigits } = require('../services/leadNotificationService');
    const rawPhone = req.body.phone;
    let cleanPhone = null;
    if (rawPhone) {
      cleanPhone = normalizeDigits(rawPhone);
      if (!cleanPhone || cleanPhone.length < 10 || cleanPhone.length > 15) {
        return res.status(400).json({ error: 'Telefone inválido (deve conter DDD e 10 a 15 dígitos).' });
      }
    }

    const target = await User.findById(req.params.id, req.user.company_id);
    if (!target) return res.status(404).json({ error: 'Atendente não encontrado.' });

    const self = target.id === req.user.id;
    const allowed = self || req.user.role === 'admin' ||
      (req.user.role === 'supervisor' && !['admin', 'supervisor'].includes(target.role));
    if (!allowed) return res.status(403).json({ error: 'Sem permissão para alterar o telefone deste usuário.' });

    await prisma.user.updateMany({ where: { id: target.id, company_id: req.user.company_id }, data: { phone: cleanPhone } });
    await Log.add(`Telefone/WhatsApp de ${target.name} ${cleanPhone ? 'atualizado para +' + cleanPhone : 'removido'} por ${req.user.name}.`, req.user.company_id);

    const allUsers = await User.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'users_updated', allUsers);

    disconnectUser(target.id);
    res.json({ success: true, phone: cleanPhone });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar telefone.' });
  }
}

async function updateAttendantStatus(req, res) {
  try {
    const { status } = req.body;
    if (!['online', 'offline'].includes(status)) {
      return res.status(400).json({ error: 'Status inválido.' });
    }

    const target = await User.findById(req.params.id, req.user.company_id);
    if (!target) return res.status(404).json({ error: 'Atendente não encontrado.' });

    const self = target.id === req.user.id;
    const allowed = self || ['admin', 'supervisor'].includes(req.user.role);
    if (!allowed) return res.status(403).json({ error: 'Sem permissão para alterar o status deste usuário.' });

    await prisma.user.updateMany({ where: { id: target.id, company_id: req.user.company_id }, data: { status } });
    const allUsers = await User.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'users_updated', allUsers);

    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao alterar status.' });
  }
}

async function updateSector(req, res) {
  try {
    const { sector } = req.body;
    if (sector !== null && !['sales', 'support', 'finance'].includes(sector)) {
      return res.status(400).json({ error: 'Setor inválido.' });
    }

    const target = await User.findById(req.params.id, req.user.company_id);
    if (!target) return res.status(404).json({ error: 'Atendente não encontrado.' });

    await prisma.user.updateMany({
      where: { id: target.id, company_id: req.user.company_id },
      data: { sector }
    });

    const allUsers = await User.findAll(req.user.company_id);
    emitToCompany(req.user.company_id, 'users_updated', allUsers);

    disconnectUser(target.id);
    res.json({ success: true, sector });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar setor.' });
  }
}

module.exports = {
  listUsers,
  deleteUser,
  revokeSessions,
  updateEmail,
  updatePhone,
  updateAttendantStatus,
  updateSector
};
