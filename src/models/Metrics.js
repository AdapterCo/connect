const { prisma } = require('../config/database');

async function addResponseTime(metric, companyId) {
  return prisma.metric.create({
    data: {
      type: 'response_time',
      chat_id: metric.chatId,
      attendant_id: metric.attendantId || null,
      is_ai: metric.isAi || false,
      duration_seconds: metric.durationSeconds,
      company_id: companyId,
      timestamp: metric.timestamp ? new Date(metric.timestamp) : new Date()
    }
  });
}

async function addAttendanceTime(metric, companyId) {
  return prisma.metric.create({
    data: {
      type: 'attendance_time',
      chat_id: metric.chatId,
      attendant_id: metric.attendantId || null,
      is_ai: false,
      duration_seconds: metric.durationSeconds,
      company_id: companyId,
      timestamp: metric.timestamp ? new Date(metric.timestamp) : new Date()
    }
  });
}

async function getMetrics(companyId) {
  const metrics = await prisma.metric.findMany({
    where: { company_id: companyId }
  });

  const responseTimes = metrics
    .filter(m => m.type === 'response_time')
    .map(m => ({
      chatId: m.chat_id,
      attendantId: m.attendant_id,
      isAi: m.is_ai,
      durationSeconds: m.duration_seconds,
      timestamp: m.timestamp.toISOString(),
      company_id: m.company_id
    }));

  const attendanceTimes = metrics
    .filter(m => m.type === 'attendance_time')
    .map(m => ({
      chatId: m.chat_id,
      attendantId: m.attendant_id,
      durationSeconds: m.duration_seconds,
      timestamp: m.timestamp.toISOString(),
      company_id: m.company_id
    }));

  return { responseTimes, attendanceTimes };
}

module.exports = {
  addResponseTime,
  addAttendanceTime,
  getMetrics
};
