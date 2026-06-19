const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const whatsappService = read('src/services/whatsappService.js');
const chatModel = read('src/models/Chat.js');
const chatController = read('src/controllers/chatController.js');
const publicApp = read('public/js/app.js');
const reactSocket = read('frontend/src/hooks/useSocket.ts');
const schema = read('prisma/schema.prisma');

assert(whatsappService.includes("sock.ev.on('messages.upsert'"), 'WhatsApp deve escutar messages.upsert');
assert(whatsappService.includes('for (const msg of m.messages)'), 'WhatsApp deve processar todas as mensagens do lote');
assert(!whatsappService.includes('const msg = m.messages[0]'), 'WhatsApp nao deve processar apenas a primeira mensagem do lote');
assert(whatsappService.includes("m.type !== 'notify'"), 'WhatsApp deve filtrar eventos que nao sao notificacao');
assert(whatsappService.includes('handleIncomingWhatsAppMessage(senderJid'), 'WhatsApp deve encaminhar mensagens recebidas ao fluxo de chat/IA');
assert(whatsappService.includes("emitToCompany(companyId, 'chat_updated'"), 'Backend deve emitir chat_updated apos mensagem recebida');
assert(whatsappService.includes('Chat.findByRemoteJid(senderJid'), 'Entrada do WhatsApp deve buscar chat por remote_jid');
assert(whatsappService.includes('Chat.createChatId(companyId, instanceId, senderJid)'), 'Entrada do WhatsApp deve criar id interno unico por tenant/instancia');
assert(whatsappService.includes('Chat.getRemoteJid(chat)'), 'Saida do WhatsApp deve usar JID remoto, nao id interno');

assert(schema.includes('remote_jid'), 'Schema deve ter remote_jid no Chat');
assert(schema.includes('@@unique([company_id, instance_id, remote_jid])'), 'Chat deve ser unico por empresa, instancia e JID remoto');
assert(chatModel.includes('function createChatId'), 'Modelo Chat deve gerar id interno deterministico');
assert(chatModel.includes('function getRemoteJid'), 'Modelo Chat deve expor helper de JID remoto');
assert(chatModel.includes('async function findByRemoteJid'), 'Modelo Chat deve buscar por remote_jid');
assert(chatController.includes('Chat.findByRemoteJid(jid'), 'Criacao manual deve evitar duplicidade por remote_jid');

assert(publicApp.includes("socket.on('chat_updated'"), 'Tela estatica deve escutar chat_updated');
assert(publicApp.includes('state.chats.push(chat)'), 'Tela estatica deve adicionar chat novo vindo do socket');
assert(publicApp.includes('renderActiveChat(chat)'), 'Tela estatica deve atualizar conversa aberta');

assert(reactSocket.includes("socket.on('chat_updated'"), 'Frontend React deve escutar chat_updated');

console.log('WhatsApp flow smoke test passed.');
