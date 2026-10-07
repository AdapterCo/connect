const Instance = require('../models/Instance');
const whatsappService = require('../services/whatsappService');

async function getInstances(req, res) {
  try {
    const companyInstances = await Instance.findAll(req.user.company_id);
    const activeConns = whatsappService.getActiveConnections();
    const isManager = ['admin', 'supervisor'].includes(req.user.role);

    const own = companyInstances.filter(inst => inst.user_id === req.user.id);
    const visible = isManager ? companyInstances : own.length ? own : companyInstances.filter(inst => !inst.user_id);
    const result = visible.map(inst => {
      const conn = activeConns[inst.id] || {};
      const canPair = isManager || (inst.user_id && inst.user_id === req.user.id);
      return {
        id: inst.id,
        name: inst.name,
        phone: conn.connectedPhone || inst.phone || null,
        status: !conn.sock || conn.stopped
          ? (conn.connectionStatus === 'connecting' && !conn.stopped ? 'connecting' : 'disconnected')
          : conn.sock.ws?.isOpen === false
            ? 'disconnected'
            : conn.connectionStatus || 'disconnected',
        user_id: inst.user_id || null,
        qr: canPair ? conn.qrCodeImage || null : null
      };
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar conexões.' });
  }
}

async function createInstance(req, res) {
  try {
    const { name, user_id } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nome da conexão é obrigatório.' });
    }

    const newId = 'inst_' + require('crypto').randomUUID();
    const newInst = {
      id: newId,
      name,
      phone: null,
      status: 'disconnected',
      user_id: user_id || null,
      company_id: req.user.company_id
    };

    const created = await Instance.create(newInst, req.user.company_id);
    res.json({ success: true, instance: created });
  } catch (error) {
    res.status(error.status || 500).json({ error: 'Erro ao criar conexão.' });
  }
}

async function connectInstance(req, res) {
  try {
    const inst = await Instance.findById(req.params.id, req.user.company_id);
    if (!inst) {
      return res.status(404).json({ error: 'Conexão não encontrada.' });
    }

    whatsappService.startWhatsAppInstance(inst.id, inst.company_id).catch(err => {
      console.error(err);
    });

    res.json({ success: true, message: 'Iniciando pareamento...' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao conectar.' });
  }
}

async function disconnectInstance(req, res) {
  try {
    const inst = await Instance.findById(req.params.id, req.user.company_id);
    if (!inst) {
      return res.status(404).json({ error: 'Conexão não encontrada.' });
    }

    await whatsappService.stopWhatsAppInstance(inst.id, true);
    await Instance.updateStatus(inst.id, 'disconnected', null, req.user.company_id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao desconectar.' });
  }
}

async function deleteInstance(req, res) {
  try {
    const inst = await Instance.findById(req.params.id, req.user.company_id);
    if (!inst) {
      return res.status(404).json({ error: 'Conexão não encontrada.' });
    }

    await whatsappService.stopWhatsAppInstance(inst.id, true);
    await Instance.remove(req.params.id, req.user.company_id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir conexão.' });
  }
}

async function assignInstance(req, res) {
  try {
    const { user_id } = req.body;
    const inst = await Instance.findById(req.params.id, req.user.company_id);
    if (!inst) {
      return res.status(404).json({ error: 'Conexão não encontrada.' });
    }
    const updated = await Instance.updateUser(req.params.id, user_id, req.user.company_id);
    const { disconnectUser } = require('../config/socket');
    if (inst.user_id) disconnectUser(inst.user_id);
    if (user_id) disconnectUser(user_id);
    res.json({ success: true, instance: updated });
  } catch (error) {
    res.status(error.status || 500).json({ error: 'Erro ao vincular conexão ao atendente.' });
  }
}

module.exports = {
  getInstances,
  createInstance,
  connectInstance,
  disconnectInstance,
  deleteInstance,
  assignInstance
};
