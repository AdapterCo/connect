// Janela de mensagens carregada junto com a conversa nas rotinas quentes
// (mensagem recebida, rodizio, atualizacoes em tempo real). Carregar o historico
// inteiro de conversas longas a cada evento derrubava a RAM/CPU da VPS.
// take negativo = as N ultimas, ja em ordem crescente de horario.
const RECENT_MESSAGE_LIMIT = 100;
const RECENT_MESSAGES = { orderBy: [{ timestamp: 'asc' }, { id: 'asc' }], take: -RECENT_MESSAGE_LIMIT };

module.exports = { RECENT_MESSAGE_LIMIT, RECENT_MESSAGES };
