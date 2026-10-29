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
  // ACEITAR e o comando atual; CONFIRMAR continua valendo para quem ja usava.
  const match = /^(?:ACEITAR|CONFIRMAR)(?:\s+(chat_[a-zA-Z0-9_-]+))?$/i.exec(text);
  if (!match) return null;
  const quoted = content?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
  return { chatId: match[1] || /(?:ACEITAR|CONFIRMAR)\s+(chat_[a-zA-Z0-9_-]+)/i.exec(quotedText)?.[1] || null };
}

async function handleConfirmation({ command, fromMe, teamMember, confirm, send, log = console }) {
  if (!command) return false;
  if (fromMe) return true;
  if (!teamMember) {
    log.warn('[SellerConfirmation] Sender not identified as company staff; command withheld from AI.');
    await send('Nao consegui identificar seu cadastro de vendedor. Confirme o atendimento pelo painel do Connect enquanto a equipe verifica seu telefone cadastrado.');
    return true;
  }
  const result = await confirm(teamMember.id, command.chatId);
  log.info('[SellerConfirmation]', result.status, 'updated:', result.chats.length);
  // No aceite, a resposta e a mensagem com os dados do lead e o ranking.
  if (result.status === 'confirmed') return true;
  const reply = result.status === 'ambiguous'
    ? 'Voce tem mais de um cliente aguardando. Envie o comando com o ID do lead desejado:\n' + result.chats.map(lead => 'ACEITAR ' + lead.id).join('\n')
    : 'Nao ha lead aguardando o seu aceite. Ele pode ter passado para outro vendedor; verifique no painel.';
  await send(reply);
  return true;
}

module.exports = { resolvePhone, confirmation, phoneJid, handleConfirmation };
