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

function every(ms, name, task) {
  let running = false;
  intervals.push(setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await task();
    } catch (err) {
      console.error(`[${name}]`, err.code || err.name, err.message);
    } finally {
      running = false;
    }
  }, ms));
}

function startWorkers() {
  every(5000, 'Sales rotation', () => salesRotationService.checkSalesRotation());
  every(10000, 'Scheduler', () => schedulerService.checkScheduledMessages());
  every(3600000, 'Billing', () => billingService.checkExpiredSubscriptions());
  every(24 * 60 * 60 * 1000, 'Retention', async () => {
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

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  initializeDatabase().then(async () => {
    // Workers e WhatsApp so comecam com o banco pronto.
    startWorkers();
    await Log.add(`Adapter Connect iniciado na porta ${PORT}.`);
    const instances = await prisma.instance.findMany({
      where: { status: 'connected' }
    });
    instances.forEach(inst => {
      whatsappService.startWhatsAppInstance(inst.id, inst.company_id).catch(err => {
        console.error(`Failed to automatically start instance ${inst.id}:`, err);
      });
    });
  }).catch(err => {
    console.error('Failed to initialize database:', err);
  });
});

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
