// Religa a IA nas conversas do numero da loja que foram desligadas por resposta
// manual (celular/WhatsApp Web) desde uma data. Por padrao so LISTA; use --apply
// para alterar.
//
//   node scripts/reactivate-ai-after-outage.js --since 2026-11-21
//   node scripts/reactivate-ai-after-outage.js --since 2026-11-21 --apply
//
// Fica de fora: chip de vendedor, bloqueadas, arquivadas, conversas que a IA
// passou para vendedor por falha e as que aparecem no log do painel como
// "IA ... desativada por <pessoa>" (o log guarda so os ultimos 100 registros).
const AI_FAILURE_TEXT = 'Desculpe, tivemos um erro no nosso sistema.';

function parseArgs(argv) {
  const sinceArg = argv[argv.indexOf('--since') + 1];
  if (!argv.includes('--since') || !/^\d{4}-\d{2}-\d{2}$/.test(sinceArg || '')) throw new Error('Informe --since AAAA-MM-DD');
  // Meia-noite de Brasilia (UTC-3).
  return { since: new Date(`${sinceArg}T03:00:00.000Z`), apply: argv.includes('--apply') };
}

function candidateWhere(since) {
  return {
    ai_active: false, is_blocked: false, is_archived: false,
    instance: { user_id: null },
    messages: {
      some: { sender: 'attendant', is_ai: false, is_note: false, timestamp: { gte: since } },
      none: { is_ai: true, text: { startsWith: AI_FAILURE_TEXT } }
    }
  };
}

// Nomes de clientes cuja IA foi desligada a mao no painel (melhor esforco).
function manuallyDisabledNames(logs) {
  const names = new Set();
  for (const log of logs) {
    const match = /^IA do atendente virtual para (.+) foi desativada por /.exec(log.message || '');
    if (match) names.add(`${log.company_id}|${match[1]}`);
  }
  return names;
}

async function main() {
  const { since, apply } = parseArgs(process.argv.slice(2));
  const { prisma } = require('../src/config/database');
  try {
    const [chats, logs] = await Promise.all([
      prisma.chat.findMany({ where: candidateWhere(since), select: { id: true, company_id: true, client_name: true, status: true } }),
      prisma.log.findMany({ where: { message: { contains: 'foi desativada por' } }, select: { message: true, company_id: true } })
    ]);
    const skip = manuallyDisabledNames(logs);
    const targets = chats.filter(chat => !skip.has(`${chat.company_id}|${chat.client_name}`));
    console.log(`Desde ${since.toISOString()}: ${chats.length} conversa(s) da loja com IA desligada apos resposta manual; ${chats.length - targets.length} pulada(s) por desligamento manual no painel.`);
    for (const chat of targets.slice(0, 30)) console.log(`  - ${chat.client_name} [${chat.status}]`);
    if (targets.length > 30) console.log(`  ... e mais ${targets.length - 30}`);
    if (!apply) { console.log(`\nNada foi alterado. Para religar a IA nessas ${targets.length} conversa(s), rode de novo com --apply.`); return; }
    const result = await prisma.chat.updateMany({ where: { id: { in: targets.map(chat => chat.id) }, ai_active: false }, data: { ai_active: true } });
    console.log(`\nIA religada em ${result.count} conversa(s). Atualize o painel (F5) para ver.`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) main().catch(error => { console.error('Falhou:', error.message); process.exit(1); });

module.exports = { parseArgs, candidateWhere, manuallyDisabledNames };
