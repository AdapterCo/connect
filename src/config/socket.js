const { Server } = require('socket.io');
const { verifyToken } = require('./auth');

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*'
    }
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Acesso negado. Token não fornecido.'));
    }
    const decoded = verifyToken(token);
    if (!decoded || typeof decoded.id !== 'string' || typeof decoded.company_id !== 'string') {
      return next(new Error('Token inválido ou expirado.'));
    }
    try {
      const { prisma } = require('./database');
      const user = await prisma.user.findFirst({ where: { id: decoded.id, company_id: decoded.company_id }, select: { id: true, role: true, company_id: true } });
      if (!user) return next(new Error('Conta indisponivel.'));
      socket.user = user;
      next();
    } catch { next(new Error('Autenticacao indisponivel.')); }
  });

  io.on('connection', (socket) => {
    const companyId = socket.user.company_id;
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    const claims = verifyToken(token);
    const expiryTimer = setTimeout(() => socket.disconnect(true), Math.max(0, (claims?.exp || 0) * 1000 - Date.now()));
    expiryTimer.unref();
    socket.on('disconnect', () => clearTimeout(expiryTimer));
    socket.join(companyId);
    socket.join('user:' + socket.user.id);

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

function emitToAll(event, data) {
  if (io) {
    io.emit(event, data);
  }
}

function emitToCompany(companyId, event, data) {
  if (!io || !companyId) return;
  for (const socket of io.sockets.sockets.values()) {
    if (socket.user.company_id !== companyId) continue;
    const manager = ['admin', 'supervisor'].includes(socket.user.role);
    if (['logs_updated', 'whatsapp_status_updated'].includes(event) && !manager) continue;
    let payload = data;
    if (event === 'chats_updated' && !manager) payload = data.filter(chat => chat.assigned_to === socket.user.id);
    if (event === 'users_updated') payload = data.map(({ id, name, username, role, status, company_id }) => ({ id, name, username, role, status, company_id }));
    socket.emit(event, payload);
  }
}

module.exports = {
  initSocket,
  getIO,
  emitToAll,
  emitToCompany
};
