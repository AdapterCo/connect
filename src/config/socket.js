const { Server } = require('socket.io');
const { companyActive, canSeeChat } = require('../services/accessService');

let io = null;

// O status online/offline so muda por escolha do usuario no painel (ou de um
// gestor na Equipe): fechar o navegador ou reiniciar o servidor nao o altera.
function socketsOf(userId) {
  return io ? [...io.sockets.sockets.values()].filter(socket => socket.user?.id === userId) : [];
}

// Encerra as conexoes em tempo real de um usuario excluido ou com sessoes
// revogadas: o socket nao continua recebendo eventos da empresa.
function disconnectUser(userId) {
  for (const socket of socketsOf(userId)) socket.disconnect(true);
}

function disconnectCompany(companyId) {
  if (!io) return;
  for (const socket of io.sockets.sockets.values()) if (socket.user?.company_id === companyId) socket.disconnect(true);
}
function initSocket(server) {
  const corsOrigin = process.env.NODE_ENV === 'production'
    ? [`https://${process.env.DOMAIN || 'connect.adapterco.com.br'}`]
    : '*';

  io = new Server(server, {
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, process.env.NODE_ENV !== 'production' || !origin || origin === 'https://' + process.env.DOMAIN);
    },
    cors: {
      origin: corsOrigin
    }
  });

  io.use((socket, next) => {
    // O navegador autentica pelo cookie HttpOnly enviado no handshake.
    const token = socket.handshake.auth?.token;
    const req = { headers: { cookie: socket.handshake.headers.cookie, ...(token ? { authorization: 'Bearer ' + token } : {}) } };
    const res = { status() { return this; }, json() { next(new Error('Sessao indisponivel.')); } };
    require('../middleware/authMiddleware')(req, res, async () => {
      try {
        const { prisma } = require('./database');
        const company = await prisma.company.findUnique({ where: { id: req.user.company_id } });
        if (!companyActive(company)) return next(new Error('Empresa indisponivel.'));
        const connections = socketsOf(req.user.id);
        if (connections.length >= 10) return next(new Error('Limite de conexoes atingido.'));
        socket.user = req.user;
        socket.userInstanceIds = await require('../models/Instance').getUserInstanceIds(req.user, req.user.company_id);
        next();
      } catch { next(new Error('Sessao indisponivel.')); }
    });
  });

  io.on('connection', (socket) => {
    const companyId = socket.user.company_id;
    const timer = setTimeout(() => socket.disconnect(true), Math.max(0, socket.user.exp * 1000 - Date.now()));
    timer.unref();
    let refreshing = false;
    const refresh = setInterval(async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const { prisma } = require('./database');
        const [user, company] = await Promise.all([
          prisma.user.findUnique({ where: { id: socket.user.id } }),
          prisma.company.findUnique({ where: { id: companyId } })
        ]);
        const ids = user ? await require('../models/Instance').getUserInstanceIds(user, companyId) : [];
        if (!user || !companyActive(company) || Number(user.session_version || 0) !== Number(socket.user.session_version || 0) || user.role !== socket.user.role || user.sector !== socket.user.sector || ids.join(',') !== (socket.userInstanceIds || []).join(',')) socket.disconnect(true);
      } catch { socket.disconnect(true); }
      finally { refreshing = false; }
    }, 30000);
    refresh.unref();
    socket.on('disconnect', () => {
      clearInterval(refresh);
      clearTimeout(timer);
    });

    try {
      const { getUserInstanceIds } = require('../models/Instance');
      getUserInstanceIds(socket.user, socket.user.company_id).then(ids => {
        socket.userInstanceIds = ids;
      }).catch(() => {});
    } catch {}

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

function canSocketSeeChat(socket, chat) {
  return canSeeChat(socket.user, chat, socket.userInstanceIds || []);
}

function emitToCompany(companyId, event, data) {
  if (!io || !companyId) return;
  if (event === 'chat_updated' && Array.isArray(data?.messages)) data = { ...data, messages: data.messages.slice(-50) };
  if (event === 'chats_updated') data = data.map(chat => ({ ...chat, messages: (chat.messages || []).slice(-50) }));
  for (const socket of io.sockets.sockets.values()) {
    if (socket.user.company_id !== companyId) continue;
    const manager = ['admin', 'supervisor'].includes(socket.user.role);
    if (event === 'logs_updated' && !manager) continue;
    if (event === 'whatsapp_status_updated' && !manager) { socket.emit(event, { changed: true }); continue; }
    if (event === 'chat_updated' && !manager && !canSocketSeeChat(socket, data)) {
      socket.emit('chat_removed', { id: data.id });
      continue;
    }
    let payload = data;
    if (event === 'chats_updated' && !manager) payload = data.filter(chat => canSocketSeeChat(socket, chat));
    if (event === 'users_updated') {
      // E-mail (dado pessoal) so para gestores e para o proprio usuario.
      payload = data.map(({ id, name, username, role, status, company_id, email, sector }) => ({
        id, name, username, role, status, company_id, sector,
        ...(manager || id === socket.user.id ? { email: email || null } : {})
      }));
    }
    socket.emit(event, payload);
  }
}

module.exports = {
  initSocket,
  getIO,
  emitToCompany,
  disconnectUser,
  disconnectCompany
};
