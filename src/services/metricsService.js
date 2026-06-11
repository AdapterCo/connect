const Metrics = require('../models/Metrics');
const Chat = require('../models/Chat');
const User = require('../models/User');

async function getStatistics(companyId) {
  const { responseTimes, attendanceTimes } = await Metrics.getMetrics(companyId);
  const chats = await Chat.findAll(companyId);
  const users = await User.findAll(companyId);

  const tmrGeral = responseTimes.length > 0 
    ? Math.round(responseTimes.reduce((acc, curr) => acc + curr.durationSeconds, 0) / responseTimes.length) 
    : 0;
  
  const aiResponses = responseTimes.filter(r => r.isAi);
  const tmrAi = aiResponses.length > 0
    ? Math.round(aiResponses.reduce((acc, curr) => acc + curr.durationSeconds, 0) / aiResponses.length)
    : 0;

  const humanResponses = responseTimes.filter(r => !r.isAi);
  const tmrHumano = humanResponses.length > 0
    ? Math.round(humanResponses.reduce((acc, curr) => acc + curr.durationSeconds, 0) / humanResponses.length)
    : 0;

  const tmaGeral = attendanceTimes.length > 0
    ? Math.round(attendanceTimes.reduce((acc, curr) => acc + curr.durationSeconds, 0) / attendanceTimes.length)
    : 0;

  const sectorCounts = {
    sales: chats.filter(c => c.sector === 'sales').length,
    support: chats.filter(c => c.sector === 'support').length,
    finance: chats.filter(c => c.sector === 'finance').length,
    none: chats.filter(c => !c.sector).length
  };

  const statusCounts = {
    iniciada: chats.filter(c => c.status === 'iniciada').length,
    interesse: chats.filter(c => c.status === 'interesse em compra').length,
    finalizada: chats.filter(c => c.status === 'finalizada').length
  };

  const attendantStats = users.map(u => {
    const replies = responseTimes.filter(r => r.attendantId === u.id);
    const individualTmr = replies.length > 0
      ? Math.round(replies.reduce((acc, curr) => acc + curr.durationSeconds, 0) / replies.length)
      : 0;

    const attendances = attendanceTimes.filter(a => a.attendantId === u.id);
    const individualTma = attendances.length > 0
      ? Math.round(attendances.reduce((acc, curr) => acc + curr.durationSeconds, 0) / attendances.length)
      : 0;

    const activeChatsCount = chats.filter(c => c.assigned_to === u.id).length;

    let totalMessagesSent = 0;
    chats.forEach(c => {
      c.messages.forEach(m => {
        if (m.sender === 'attendant' && m.sender_id === u.id && !m.is_note) {
          totalMessagesSent++;
        }
      });
    });

    return {
      id: u.id,
      name: u.name,
      role: u.role,
      status: u.status,
      repliesCount: totalMessagesSent || replies.length,
      tmr: individualTmr,
      tma: individualTma,
      activeChats: activeChatsCount
    };
  });

  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateString = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const fullDateString = d.toISOString().split('T')[0];
    last7Days.push({
      label: dateString,
      fullDate: fullDateString,
      clientMessages: 0,
      attendantMessages: 0
    });
  }

  chats.forEach(c => {
    c.messages.forEach(m => {
      if (m.timestamp) {
        const timestampStr = typeof m.timestamp === 'string' ? m.timestamp : m.timestamp.toISOString();
        const msgDate = timestampStr.split('T')[0];
        const dayBucket = last7Days.find(d => d.fullDate === msgDate);
        if (dayBucket) {
          if (m.sender === 'client') {
            dayBucket.clientMessages++;
          } else if (m.sender === 'attendant' && !m.is_note) {
            dayBucket.attendantMessages++;
          }
        }
      }
    });
  });

  return {
    kpis: {
      tmrGeral,
      tmrAi,
      tmrHumano,
      tmaGeral,
      totalChats: chats.length,
      finishedChats: statusCounts.finalizada
    },
    attendants: attendantStats,
    sectors: sectorCounts,
    status: statusCounts,
    history: last7Days,
    rawMetrics: {
      responseTimes,
      attendanceTimes
    }
  };
}

module.exports = {
  getStatistics
};
