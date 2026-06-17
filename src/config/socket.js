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
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Acesso negado. Token não fornecido.'));
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return next(new Error('Token inválido ou expirado.'));
    }
    socket.user = decoded;
    next();
  });

  io.on('connection', (socket) => {
    const companyId = socket.user.company_id;
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
  if (io) {
    io.to(companyId).emit(event, data);
  }
}

module.exports = {
  initSocket,
  getIO,
  emitToCompany
};
