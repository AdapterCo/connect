const http = require('http');
const app = require('./app');
const { PORT } = require('./src/config/index');
const { initializeDatabase } = require('./src/config/database');
const { initSocket } = require('./src/config/socket');
const whatsappService = require('./src/services/whatsappService');
const schedulerService = require('./src/services/schedulerService');
const Log = require('./src/models/Log');

const server = http.createServer(app);

initSocket(server);

async function start() {
  await initializeDatabase();
  server.listen(PORT, () => console.log(`CRM listening on port ${PORT}`));
  const { prisma } = require('./src/config/database');
  const instances = await prisma.instance.findMany();
  for (const inst of instances) whatsappService.startWhatsAppInstance(inst.id, inst.company_id).catch(err => console.error('WhatsApp startup failed:', err.message));
  setInterval(() => schedulerService.checkScheduledMessages().catch(console.error), 10000);
}
start().catch(err => { console.error('Startup failed:', err.code || err.name); process.exitCode = 1; server.close(); });
