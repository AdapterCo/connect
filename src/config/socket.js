const { Server } = require('socket.io');
const { verifyToken } = require('./auth');

let io = null;

// Presenca: quem fecha o navegador sem logout fica "online" e continuaria
// recebendo leads do rodizio. Sem nenhuma aba conectada por PRESENCE_GRACE_MS
// (tempo para recarregar a pagina ou oscilar a rede), o status vira offline.
const PRESENCE_GRACE_MS = 2 * 60 * 1000;
const presenceTimers = new Map();

function socketsOf(userId) {
  return io ? [...io.sockets.sockets.values()].filter(socket => socket.user?.id === userId) : [];
}

function cancelPresenceTimeout(userId) {
  clearTimeout(presenceTimers.get(userId));
  presenceTimers.delete(userId);
}

function schedulePresenceTimeout(user) {
  if (socketsOf(user.id).length) return;
  cancelPresenceTimeout(user.id);
  const timer = setTimeout(() => {
    presenceTimers.delete(user.id);
    markOfflineIfDisconnected(user).catch(error => console.error('Presence update failed:', error.code || error.name));
  }, PRESENCE_GRACE_MS);
  timer.unref();
  presenceTimers.set(user.id, timer);
}

async function markOfflineIfDisconnected(user) {
  if (socketsOf(user.id).length) return;
  const { prisma } = require('./database');
  const result = await prisma.user.updateMany({ where: { id: user.id, status: 'online' }, data: { status: 'offline' } });
  if (result.count) {
    emitToCompany(user.company_id, 'users_updated', await require('../models/User').findAll(user.company_id));
  }
}

// Apos reiniciar o servidor nenhum evento de desconexao ocorre: quem nao voltou
// a conectar dentro do prazo de tolerancia deixa de constar como online.
async function sweepPresence() {
  const { prisma } = require('./database');
  const online = await prisma.user.findMany({ where: { status: 'online' }, select: { id: true, company_id: true } });
  for (const user of online) await markOfflineIfDisconnected(user);
}

// Encerra as conexoes em tempo real de um usuario excluido ou com sessoes
// revogadas: o socket nao continua recebendo eventos da empresa.
function disconnectUser(userId) {
  for (const socket of socketsOf(userId)) socket.disconnect(true);
}

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
    // O navegador autentica pelo cookie HttpOnly enviado no handshake.
    const token = socket.handshake.auth?.token;
    const req = { headers: { cookie: socket.handshake.headers.cookie, ...(token ? { authorization: 'Bearer ' + token } : {}) } };
    const res = { status() { return this; }, json() { next(new Error('Sessao indisponivel.')); } };
    require('../middleware/authMiddleware')(req, res, () => { socket.user = req.user; next(); });
  });

  io.on('connection', (socket) => {
    const companyId = socket.user.company_id;
    const timer = setTimeout(() => socket.disconnect(true), Math.max(0, socket.user.exp * 1000 - Date.now()));
    timer.unref();
    cancelPresenceTimeout(socket.user.id);
    socket.on('disconnect', () => {
      clearTimeout(timer);
      schedulePresenceTimeout(socket.user);
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
  if (['admin', 'supervisor', 'superadmin'].includes(socket.user.role)) return true;
  const userSector = socket.user.sector || (socket.user.role === 'seller' ? 'sales' : (socket.user.role === 'support' ? 'support' : null));
  if (userSector && chat.sector && chat.sector !== userSector) return false;
  if (socket.userInstanceIds && socket.userInstanceIds.length > 0) {
    return socket.userInstanceIds.includes(chat.instance_id) || chat.assigned_to === socket.user.id;
  }
  return chat.assigned_to === socket.user.id;
}

function emitToCompany(companyId, event, data) {
  if (!io || !companyId) return;
  for (const socket of io.sockets.sockets.values()) {
    if (socket.user.company_id !== companyId) continue;
    const manager = ['admin', 'supervisor'].includes(socket.user.role);
    if (['logs_updated', 'whatsapp_status_updated'].includes(event) && !manager) continue;
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
  markOfflineIfDisconnected,
  sweepPresence,
  PRESENCE_GRACE_MS
};
