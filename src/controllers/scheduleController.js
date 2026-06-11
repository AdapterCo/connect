const Chat = require('../models/Chat');
const ScheduledMessage = require('../models/ScheduledMessage');
const Log = require('../models/Log');

async function createSchedule(req, res) {
  try {
    const { text, scheduledTime, mediaUrl, mediaType, fileName } = req.body;
    if (!scheduledTime) {
      return res.status(400).json({ error: 'Data e hora do agendamento são obrigatórias.' });
    }

    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }

    const scheduleDate = new Date(scheduledTime);
    if (isNaN(scheduleDate.getTime()) || scheduleDate.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Data de agendamento inválida ou no passado.' });
    }

    const newSchedule = {
      id: 'sch_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      chatId: req.params.id,
      clientName: chat.client_name,
      text,
      scheduledTime,
      mediaUrl,
      mediaType,
      fileName,
      created_by: req.user.name,
      company_id: req.user.company_id
    };

    const created = await ScheduledMessage.create(newSchedule, req.user.company_id);
    await Log.add(`Mensagem agendada para ${chat.client_name} em ${new Date(scheduledTime).toLocaleString()} por ${req.user.name}.`, req.user.company_id);

    res.json({ success: true, schedule: created });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar agendamento.' });
  }
}

async function listSchedules(req, res) {
  try {
    const chat = await Chat.findById(req.params.id, req.user.company_id);
    if (!chat) {
      return res.status(404).json({ error: 'Conversa não encontrada.' });
    }
    const schedules = await ScheduledMessage.findAll(req.user.company_id);
    const filtered = schedules.filter(s => s.chatId === req.params.id);
    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar agendamentos.' });
  }
}

async function deleteSchedule(req, res) {
  try {
    const schedules = await ScheduledMessage.findAll(req.user.company_id);
    const sch = schedules.find(s => s.id === req.params.id);
    if (!sch) {
      return res.status(404).json({ error: 'Agendamento não encontrado.' });
    }

    await ScheduledMessage.remove(req.params.id, req.user.company_id);
    await Log.add(`Agendamento cancelado para ${sch.clientName} (era para ${new Date(sch.scheduledTime).toLocaleString()}) por ${req.user.name}.`, req.user.company_id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao excluir agendamento.' });
  }
}

module.exports = {
  createSchedule,
  listSchedules,
  deleteSchedule
};
