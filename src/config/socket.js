const { Server } = require('socket.io');
const { verifyToken } = require('./auth');
const { DOMAIN } = require('./index');

let io = null;

function initSocket(server) {
  const isProduction = process.env.NODE_ENV === 'production';
  const allowedOrigins = isProduction
    ? [`https://${DOMAIN}`, `http://${DOMAIN}`]
    : ['http://localhost:3000', 'http://localhost:5173'];

  io = new Server(server, {
    cors: {
      origin: isProduction ? allowedOrigins : '*'
    }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
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

function emitToAll(event, data) {
  if (io) {
    io.emit(event, data);
  }
}

function emitToCompany(companyId, event, data) {
  if (io) {
    io.to(companyId).emit(event, data);
  }
}

module.exports = {
  initSocket,
  getIO,
  emitToAll,
  emitToCompany
};
