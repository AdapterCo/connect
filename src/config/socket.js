const { Server } = require('socket.io');
const { verifyToken } = require('./auth');

let io = null;

function initSocket(server) {
  const corsOrigin = process.env.NODE_ENV === 'production'
    ? [`https://${process.env.DOMAIN || 'connect.adapterco.com.br'}`]
    : '*';

  io = new Server(server, {
    cors: {
      origin: corsOrigin
    }
  });

  io.use((socket, next) => {
    const req = { headers: { authorization: 'Bearer ' + (socket.handshake.auth?.token || '') } };
    const res = { status() { return this; }, json() { next(new Error('Sessao indisponivel.')); } };
    require('../middleware/authMiddleware')(req, res, () => { socket.user = req.user; next(); });
  });

  io.on('connection', (socket) => {
    const companyId = socket.user.company_id;
    const timer = setTimeout(() => socket.disconnect(true), Math.max(0, socket.user.exp * 1000 - Date.now()));
    timer.unref();
    socket.on('disconnect', () => clearTimeout(timer));
    socket.join(companyId);

    socket.on('join_company', (requestedCompanyId) => {
      if (socket.user.company_id === requestedCompanyId) {
        socket.join(requestedCompanyId);
      }
    });
  });

  return io;
}

function getIO() {
  return io;
}

function emitToCompany(companyId, event, data) {
  if (!io || !companyId) return;
  for (const socket of io.sockets.sockets.values()) {
    if (socket.user.company_id !== companyId) continue;
    const manager = ['admin', 'supervisor'].includes(socket.user.role);
    if (['logs_updated', 'whatsapp_status_updated'].includes(event) && !manager) continue;
    if (event === 'chat_updated' && !manager && data.assigned_to !== socket.user.id) {
      socket.emit('chat_removed', { id: data.id });
      continue;
    }
    let payload = data;
    if (event === 'chats_updated' && !manager) payload = data.filter(chat => chat.assigned_to === socket.user.id);
    if (event === 'users_updated') payload = data.map(({ id, name, username, role, status, company_id }) => ({ id, name, username, role, status, company_id }));
    socket.emit(event, payload);
  }
}

module.exports = {
  initSocket,
  getIO,
  emitToCompany
};
