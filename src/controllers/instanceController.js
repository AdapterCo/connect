const Instance = require('../models/Instance');
const whatsappService = require('../services/whatsappService');

async function getInstances(req, res) {
  try {
    const companyInstances = await Instance.findAll(req.user.company_id);
    const activeConns = whatsappService.getActiveConnections();

    const result = companyInstances.map(inst => {
      const conn = activeConns[inst.id] || {};
      return {
        id: inst.id,
        name: inst.name,
        phone: conn.connectedPhone || inst.phone || null,
        status: conn.connectionStatus || inst.status || 'disconnected',
        qr: conn.qrCodeImage || null
      };
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar conexões.' });
  }
}

async function createInstance(req, res) {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Nome da conexão é obrigatório.' });
    }

    const newId = 'inst_' + Date.now();
    const newInst = {
      id: newId,
      name,
      phone: null,
      status: 'disconnected',
      company_id: req.user.company_id
    };

    const created = await Instance.create(newInst, req.user.company_id);
    res.json({ success: true, instance: created });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar conexão.' });
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

    await whatsappService.stopWhatsAppInstance(inst.id, false);
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

module.exports = {
  getInstances,
  createInstance,
  connectInstance,
  disconnectInstance,
  deleteInstance
};
