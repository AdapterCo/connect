const { prisma } = require('../config/database');

async function listPrinters(req, res) {
  try {
    const printers = await prisma.printer.findMany({
      where: { company_id: req.user.company_id },
      orderBy: { created_at: 'asc' }
    });
    res.json(printers);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar impressoras.' });
  }
}

async function createPrinter(req, res) {
  try {
    const { name, ip_address, port, is_active } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Nome da impressora é obrigatório.' });
    }

    if (!ip_address || ip_address.trim().length === 0) {
      return res.status(400).json({ error: 'Endereço IP da impressora é obrigatório.' });
    }

    const printer = await prisma.printer.create({
      data: {
        name: name.trim(),
        ip_address: ip_address.trim(),
        port: parseInt(port) || 9100,
        is_active: is_active !== false,
        company_id: req.user.company_id
      }
    });

    res.status(201).json(printer);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar impressora: ' + error.message });
  }
}

async function updatePrinter(req, res) {
  try {
    const { id } = req.params;
    const { name, ip_address, port, is_active } = req.body;

    const existing = await prisma.printer.findFirst({
      where: { id, company_id: req.user.company_id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Impressora não encontrada.' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (ip_address !== undefined) updateData.ip_address = ip_address.trim();
    if (port !== undefined) updateData.port = parseInt(port) || 9100;
    if (is_active !== undefined) updateData.is_active = is_active;

    const updated = await prisma.printer.update({
      where: { id },
      data: updateData
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar impressora.' });
  }
}

async function deletePrinter(req, res) {
  try {
    const { id } = req.params;

    const existing = await prisma.printer.findFirst({
      where: { id, company_id: req.user.company_id }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Impressora não encontrada.' });
    }

    await prisma.printer.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir impressora.' });
  }
}

module.exports = {
  listPrinters,
  createPrinter,
  updatePrinter,
  deletePrinter
};
