const { prisma } = require('../config/database');

const ACCEPTED = 'lead_accepted';
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

// Inicio do mes no horario de Brasilia (sem horario de verao desde 2019).
function monthStart(now = new Date()) {
  const local = new Date(now.getTime() - BRT_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + BRT_OFFSET_MS);
}

// Cada lead aceito no mes vale 1 ponto; empates dividem a posicao.
async function ranking(companyId, now = new Date(), db = prisma) {
  const [sellers, accepted] = await Promise.all([
    db.user.findMany({ where: { company_id: companyId, role: 'seller' }, select: { id: true, name: true } }),
    db.auditLog.findMany({ where: { company_id: companyId, action: ACCEPTED, timestamp: { gte: monthStart(now) } }, select: { user_id: true } })
  ]);
  const points = new Map(sellers.map(seller => [seller.id, 0]));
  for (const row of accepted) if (points.has(row.user_id)) points.set(row.user_id, points.get(row.user_id) + 1);
  const list = sellers.map(seller => ({ id: seller.id, name: seller.name, points: points.get(seller.id) }));
  return list
    .map(seller => ({ ...seller, position: 1 + list.filter(other => other.points > seller.points).length }))
    .sort((a, b) => a.position - b.position || String(a.name).localeCompare(String(b.name)));
}

const pointsText = count => count === 1 ? '1 ponto' : `${count} pontos`;

function standingText(list, sellerId) {
  const me = list.find(seller => seller.id === sellerId);
  if (!me) return '';
  const ahead = list.filter(seller => seller.points > me.points);
  if (!me.points && !ahead.length) return '🏆 Ninguém pontuou no ranking do mês ainda. Cada lead aceito vale 1 ponto.';
  if (me.position === 1) return `🥇 Você está em 1º lugar no ranking do mês com ${pointsText(me.points)}. Parabéns!`;
  const gap = Math.min(...ahead.map(seller => seller.points)) - me.points;
  return `🏆 Você está em ${me.position}º lugar no ranking do mês com ${pointsText(me.points)}. Faltam ${pointsText(gap)} para subir de posição.`;
}

async function standing(companyId, sellerId, now = new Date()) {
  return standingText(await ranking(companyId, now), sellerId);
}

module.exports = { ACCEPTED, monthStart, ranking, standingText, standing };
