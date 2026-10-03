const http = require('http');
const app = require('./app');
const { PORT } = require('./src/config/index');
const { initializeDatabase, prisma } = require('./src/config/database');
const { initSocket, getIO, sweepPresence, PRESENCE_GRACE_MS } = require('./src/config/socket');
const whatsappService = require('./src/services/whatsappService');
const schedulerService = require('./src/services/schedulerService');
const billingService = require('./src/services/billingService');
const retentionService = require('./src/services/retentionService');
const salesRotationService = require('./src/services/salesRotationService');
const Log = require('./src/models/Log');

const server = http.createServer(app);

initSocket(server);

// Os workers usam intervalos em memoria: rode apenas UMA instancia do app
// (replicas: 1 no stack.yml), senao rodizio e cobrancas executam em duplicidade.
const intervals = [];
const activeJobs = new Set();

function every(ms, name, task) {
  let running = false;
  intervals.push(setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const job = Promise.resolve().then(task);
      activeJobs.add(job);
      try { await job; } finally { activeJobs.delete(job); }
    } catch (err) {
      console.error(`[${name}]`, err.code || err.name, err.message);
    } finally {
      running = false;
    }
  }, ms));
}

function startWorkers() {
  every(5000, 'Sales rotation', () => salesRotationService.checkSalesRotation());
  every(5000, 'Commercial reminders', () => require('./src/services/pushService').reminders());
  every(60000, 'Media cleanup', () => require('./src/services/mediaCleanupService').cleanPending());
  every(10000, 'Scheduler', () => schedulerService.checkScheduledMessages());
  every(60000, 'Payment reconciliation', () => billingService.reconcilePayments());
  every(60000, 'Billing', () => billingService.checkExpiredSubscriptions());
  every(24 * 60 * 60 * 1000, 'Retention', async () => {
    await require('./src/services/mediaStorageService').cleanOrphans();
    const result = await retentionService.applyRetentionPolicy();
    if (!result.skipped) {
      await Log.add(`Politica de retencao executada: ${JSON.stringify(result)}.`);
    }
  });

  const presenceSweep = setTimeout(() => {
    sweepPresence().catch(err => console.error('[Presence]', err.code || err.name, err.message));
  }, PRESENCE_GRACE_MS);
  presenceSweep.unref();
}

async function boot() {
  await initializeDatabase();
  await Log.add('Adapter Connect iniciado.');
  startWorkers();
  server.listen(PORT, () => console.log('Server running on port ' + PORT));
  const instances = await prisma.instance.findMany({ where: { status: 'connected' } });
  for (const inst of instances) whatsappService.startWhatsAppInstance(inst.id, inst.company_id).catch(error => console.error('[WhatsApp boot]', error.code || error.name));
}
boot().catch(error => { console.error('[Boot failed]', error.code || error.name); process.exit(1); });

let shuttingDown = false;

function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[${signal}] Shutting down gracefully...`);

  intervals.forEach(clearInterval);

  const forced = setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
  forced.unref();

  // Conexoes abertas (socket.io e keep-alive) impediriam o close de terminar.
  getIO()?.disconnectSockets(true);
  server.closeIdleConnections();

  server.close(async () => {
    console.log('HTTP server closed.');
    await Promise.allSettled([...activeJobs]);
    // Fecha os sockets do WhatsApp sem apagar as sessoes pareadas.
    const connections = Object.keys(whatsappService.getActiveConnections());
    await Promise.allSettled(connections.map(id => whatsappService.stopWhatsAppInstance(id, false)));
    try {
      await prisma.$disconnect();
      console.log('Prisma disconnected.');
    } catch (err) {
      console.error('Error disconnecting Prisma:', err);
    }
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
