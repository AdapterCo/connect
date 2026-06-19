const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

const whatsappService = read('src/services/whatsappService.js');
const publicApp = read('public/js/app.js');
const reactSocket = read('frontend/src/hooks/useSocket.ts');

assert(whatsappService.includes("sock.ev.on('messages.upsert'"), 'WhatsApp deve escutar messages.upsert');
assert(whatsappService.includes('for (const msg of m.messages)'), 'WhatsApp deve processar todas as mensagens do lote');
assert(!whatsappService.includes('const msg = m.messages[0]'), 'WhatsApp nao deve processar apenas a primeira mensagem do lote');
assert(whatsappService.includes("m.type !== 'notify'"), 'WhatsApp deve filtrar eventos que nao sao notificacao');
assert(whatsappService.includes('handleIncomingWhatsAppMessage(senderJid'), 'WhatsApp deve encaminhar mensagens recebidas ao fluxo de chat/IA');
assert(whatsappService.includes("emitToCompany(companyId, 'chat_updated'"), 'Backend deve emitir chat_updated apos mensagem recebida');

assert(publicApp.includes("socket.on('chat_updated'"), 'Tela estatica deve escutar chat_updated');
assert(publicApp.includes('state.chats.push(chat)'), 'Tela estatica deve adicionar chat novo vindo do socket');
assert(publicApp.includes('renderActiveChat(chat)'), 'Tela estatica deve atualizar conversa aberta');

assert(reactSocket.includes("socket.on('chat_updated'"), 'Frontend React deve escutar chat_updated');

console.log('WhatsApp flow smoke test passed.');
