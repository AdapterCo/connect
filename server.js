const http = require('http');
const app = require('./app');
const { PORT } = require('./src/config/index');
const { initializeDatabase, prisma } = require('./src/config/database');
const { initSocket } = require('./src/config/socket');
const whatsappService = require('./src/services/whatsappService');
const schedulerService = require('./src/services/schedulerService');
const mercadoPagoService = require('./src/services/mercadoPagoService');
const billingService = require('./src/services/billingService');
const Log = require('./src/models/Log');

const server = http.createServer(app);

initSocket(server);

let schedulerRunning = false;
let paymentsRunning = false;
let billingRunning = false;

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  initializeDatabase().then(async () => {
    await Log.add(`Adapter Connect iniciado na porta ${PORT}.`);
    const instances = await prisma.instance.findMany();
    instances.forEach(inst => {
      whatsappService.startWhatsAppInstance(inst.id, inst.company_id).catch(err => {
        console.error(`Failed to automatically start instance ${inst.id}:`, err);
      });
    });
  }).catch(err => {
    console.error('Failed to initialize database:', err);
  });
});

setInterval(async () => {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    await schedulerService.checkScheduledMessages();
  } catch (err) {
    console.error(err);
  } finally {
    schedulerRunning = false;
  }
}, 10000);

setInterval(async () => {
  if (paymentsRunning) return;
  paymentsRunning = true;
  try {
    console.log('[Server] Executando polling de pagamentos...');
    await mercadoPagoService.checkAllPendingPayments();
  } catch (err) {
    console.error('[Server] Erro no polling de pagamentos:', err);
  } finally {
    paymentsRunning = false;
  }
}, 20000);

setInterval(async () => {
  if (billingRunning) return;
  billingRunning = true;
  try {
    await billingService.checkExpiredSubscriptions();
  } catch (err) {
    console.error(err);
  } finally {
    billingRunning = false;
  }
}, 3600000);

function gracefulShutdown(signal) {
  console.log(`\n[${signal}] Shutting down gracefully...`);

  server.close(async () => {
    console.log('HTTP server closed.');
    try {
      await prisma.$disconnect();
      console.log('Prisma disconnected.');
    } catch (err) {
      console.error('Error disconnecting Prisma:', err);
    }
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
