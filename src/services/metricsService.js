const { prisma } = require('../config/database');
async function getStatistics(companyId) {
  if (!companyId) throw new Error('Empresa obrigatoria.');
  const since = new Date(); since.setUTCHours(0, 0, 0, 0); since.setUTCDate(since.getUTCDate() - 6);
  const [chats, metrics, messages, users, days] = await Promise.all([
    prisma.chat.groupBy({ by: ['status', 'sector', 'assigned_to'], where: { company_id: companyId }, _count: { _all: true } }),
    prisma.metric.groupBy({ by: ['type', 'is_ai', 'attendant_id'], where: { company_id: companyId }, _sum: { duration_seconds: true }, _count: { _all: true } }),
    prisma.message.groupBy({ by: ['sender_id'], where: { chat: { company_id: companyId }, sender: 'attendant', is_note: false }, _count: { _all: true } }),
    prisma.user.findMany({ where: { company_id: companyId }, select: { id: true, name: true, role: true, status: true } }),
    prisma.$queryRaw`SELECT TO_CHAR(m.timestamp, 'YYYY-MM-DD') AS day, m.sender, COUNT(*)::integer AS count
      FROM "Message" m JOIN "Chat" c ON c.id = m.chat_id
      WHERE c.company_id = ${companyId} AND m.timestamp >= ${since} AND (m.sender = 'client' OR (m.sender = 'attendant' AND m.is_note = false))
      GROUP BY day, m.sender`
  ]);
  const countChats = filter => chats.filter(filter).reduce((sum, row) => sum + row._count._all, 0);
  const average = filter => {
    const rows = metrics.filter(filter), count = rows.reduce((sum, row) => sum + row._count._all, 0);
    return count ? Math.round(rows.reduce((sum, row) => sum + (row._sum.duration_seconds || 0), 0) / count) : 0;
  };
  const status = { iniciada: countChats(row => row.status === 'iniciada'), interesse: countChats(row => row.status === 'interesse em compra'), finalizada: countChats(row => row.status === 'finalizada') };
  const history = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(since); day.setUTCDate(day.getUTCDate() + index);
    const fullDate = day.toISOString().slice(0, 10);
    return { label: day.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }), fullDate,
      clientMessages: Number(days.find(row => row.day === fullDate && row.sender === 'client')?.count || 0),
      attendantMessages: Number(days.find(row => row.day === fullDate && row.sender === 'attendant')?.count || 0) };
  });
  return {
    kpis: { tmrGeral: average(row => row.type === 'response_time'), tmrAi: average(row => row.type === 'response_time' && row.is_ai), tmrHumano: average(row => row.type === 'response_time' && !row.is_ai), tmaGeral: average(row => row.type === 'attendance_time'), totalChats: countChats(() => true), finishedChats: status.finalizada },
    attendants: users.map(user => ({ ...user,
      repliesCount: messages.find(row => row.sender_id === user.id)?._count._all || metrics.filter(row => row.type === 'response_time' && row.attendant_id === user.id).reduce((sum, row) => sum + row._count._all, 0),
      tmr: average(row => row.type === 'response_time' && row.attendant_id === user.id),
      tma: average(row => row.type === 'attendance_time' && row.attendant_id === user.id),
      activeChats: countChats(row => row.assigned_to === user.id) })),
    sectors: { sales: countChats(row => row.sector === 'sales'), support: countChats(row => row.sector === 'support'), finance: countChats(row => row.sector === 'finance'), none: countChats(row => !row.sector) }, status, history
  };
}
module.exports = { getStatistics };
