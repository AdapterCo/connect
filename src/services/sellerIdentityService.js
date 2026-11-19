// Resolve only verified WhatsApp identities. A LID is never a phone number.
function phoneJid(value) {
  if (typeof value !== 'string' || !value.endsWith('@s.whatsapp.net')) return null;
  const phone = value.split('@')[0].split(':')[0];
  return /^\d{10,15}$/.test(phone) ? `${phone}@s.whatsapp.net` : null;
}

async function resolvePhone(state, jid, alternative, lookupKnownPhone, staffPhones = []) {
  const direct = phoneJid(jid) || phoneJid(alternative) || phoneJid(state.phoneAliases?.get(jid));
  if (direct) return direct;
  if (!jid?.endsWith('@lid')) return null;
  const repository = state.sock?.signalRepository?.lidMapping;
  let mapped = null;
  try { mapped = repository?.getPNForLID ? phoneJid(await repository.getPNForLID(jid)) : null; }
  catch (error) { console.warn('[SellerIdentity] Repository lookup failed:', error.code || error.name); }
  const known = mapped || phoneJid(await lookupKnownPhone(jid));
  if (known) { state.phoneAliases.set(jid, known); return known; }
  // Older Baileys versions expose PN -> LID through onWhatsApp. Resolve only
  // company staff numbers, never guess a seller from a lead ID or pushName.
  if (staffPhones.length && state.sock?.onWhatsApp && (!state.staffLookupAt || Date.now() - state.staffLookupAt > 30000)) {
    state.staffLookupAt = Date.now();
    const result = await state.sock.onWhatsApp(...staffPhones);
    for (const contact of result || []) {
      const pn = phoneJid(contact.jid);
      if (contact.exists && pn && typeof contact.lid === 'string' && contact.lid.endsWith('@lid')) state.phoneAliases.set(contact.lid, pn);
    }
  }
  return phoneJid(state.phoneAliases.get(jid));
}

function confirmation(message) {
  let content = message;
  for (let depth = 0; depth < 8; depth++) {
    const wrapped = content?.ephemeralMessage?.message || content?.viewOnceMessage?.message || content?.viewOnceMessageV2?.message;
    if (!wrapped) break;
    content = wrapped;
  }
  // Ignora pontuacao e emojis no fim ("Aceitar.", "ACEITAR 👍").
  const text = String(content?.conversation || content?.extendedTextMessage?.text || '').trim().replace(/[^\p{L}\p{N}_-]+$/u, '');
  // Escolha pela lista numerada: "ACEITAR 2", "CLIENTE 2" ou so "2".
  const choice = /^(ACEITAR\s+|CONFIRMAR\s+)?(?:CLIENTE\s*)?(\d{1,2})$/i.exec(text);
  if (choice && Number(choice[2]) > 0) return { chatId: null, index: Number(choice[2]), loose: !choice[1] };
  // ACEITAR e o comando atual; CONFIRMAR continua valendo para quem ja usava.
  const match = /^(?:ACEITAR|CONFIRMAR)(?:\s+(chat_[a-zA-Z0-9_-]+))?$/i.exec(text);
  if (!match) return null;
  const quoted = content?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
  return { chatId: match[1] || /(?:ACEITAR|CONFIRMAR)\s+(chat_[a-zA-Z0-9_-]+)/i.exec(quotedText)?.[1] || null };
}

// Ultima lista numerada enviada a cada vendedor, para "2" apontar sempre para o
// mesmo cliente mesmo que a fila mude entre a lista e a resposta.
const CHOICE_TTL_MS = 30 * 60 * 1000;
const pendingChoices = new Map();

function activeChoice(sellerId, now = Date.now()) {
  const entry = pendingChoices.get(sellerId);
  if (entry && now - entry.at <= CHOICE_TTL_MS) return entry.options;
  pendingChoices.delete(sellerId);
  return null;
}

function rememberChoice(sellerId, leads, now = Date.now()) {
  for (const [id, entry] of pendingChoices) if (now - entry.at > CHOICE_TTL_MS) pendingChoices.delete(id);
  const options = leads.map(lead => {
    const digits = String(lead.client_phone || '').replace(/\D/g, '');
    const name = String(lead.client_name || '').trim() || 'Cliente';
    return { id: lead.id, label: digits.length >= 4 ? `${name} (final ${digits.slice(-4)})` : name };
  });
  pendingChoices.set(sellerId, { options, at: now });
  return options;
}

function choiceList(options) {
  return `Voce tem ${options.length} clientes aguardando. Responda so com o numero do cliente que vai atender:\n\n` +
    options.map((option, i) => `*${i + 1}* - ${option.label}`).join('\n') + '\n\nExemplo: 1';
}

async function handleConfirmation({ command, fromMe, teamMember, confirm, send, log = console }) {
  if (!command) return false;
  // Numero solto so e comando para vendedor com lista aberta; para todos os
  // demais (clientes, mensagens enviadas pela loja) segue o fluxo normal.
  if (command.loose && (fromMe || !teamMember || !activeChoice(teamMember.id))) return false;
  if (fromMe) return true;
  if (!teamMember) {
    log.warn('[SellerConfirmation] Sender not identified as company staff; command withheld from AI.');
    await send('Nao consegui identificar seu cadastro de vendedor. Confirme o atendimento pelo painel do Connect enquanto a equipe verifica seu telefone cadastrado.');
    return true;
  }
  let chatId = command.chatId || null;
  if (command.index) {
    const options = activeChoice(teamMember.id);
    if (options && !options[command.index - 1]) {
      await send('Esse numero nao esta na lista.\n\n' + choiceList(options));
      return true;
    }
    chatId = options ? options[command.index - 1].id : null;
  }
  const result = await confirm(teamMember.id, chatId);
  log.info('[SellerConfirmation]', result.status, 'updated:', result.chats.length);
  // No aceite, a resposta e a mensagem com os dados do lead e o ranking.
  if (result.status === 'confirmed') return true;
  if (result.status === 'ambiguous') {
    await send(choiceList(rememberChoice(teamMember.id, result.options || result.chats)));
    return true;
  }
  if (chatId && command.index) pendingChoices.delete(teamMember.id);
  await send(chatId && command.index
    ? 'Esse cliente nao esta mais aguardando o seu aceite (pode ter passado para outro vendedor). Envie ACEITAR para ver a lista atualizada.'
    : 'Nao ha lead aguardando o seu aceite. Ele pode ter passado para outro vendedor; verifique no painel.');
  return true;
}

module.exports = { resolvePhone, confirmation, phoneJid, handleConfirmation, _pendingChoices: pendingChoices };
