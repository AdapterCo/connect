const http = require('http');
const app = require('./app');
const { PORT } = require('./src/config/index');
const { initializeDatabase } = require('./src/config/database');
const { initSocket } = require('./src/config/socket');
const whatsappService = require('./src/services/whatsappService');
const schedulerService = require('./src/services/schedulerService');
const mercadoPagoService = require('./src/services/mercadoPagoService');
const billingService = require('./src/services/billingService');
const Log = require('./src/models/Log');

const server = http.createServer(app);

initSocket(server);

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  initializeDatabase().then(async () => {
    await Log.add(`Adapter Connect iniciado na porta ${PORT}.`);
    const { prisma } = require('./src/config/database');
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

setInterval(() => {
  schedulerService.checkScheduledMessages().catch(err => console.error(err));
}, 10000);

setInterval(() => {
  mercadoPagoService.checkAllPendingPayments().catch(err => console.error(err));
}, 20000);

setInterval(() => {
  billingService.checkExpiredSubscriptions().catch(err => console.error(err));
}, 3600000);
