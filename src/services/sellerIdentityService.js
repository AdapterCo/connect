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
  const text = content?.conversation || content?.extendedTextMessage?.text || '';
  const match = /^CONFIRMAR(?:\s+(chat_[a-zA-Z0-9_-]+))?$/i.exec(text.trim());
  if (!match) return null;
  const quoted = content?.extendedTextMessage?.contextInfo?.quotedMessage;
  const quotedText = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
  return { chatId: match[1] || /CONFIRMAR\s+(chat_[a-zA-Z0-9_-]+)/i.exec(quotedText)?.[1] || null };
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
  const reply = result.status === 'confirmed'
    ? 'Atendimento confirmado para ' + result.chat.client_name + '. O rodizio foi pausado para este cliente.'
    : result.status === 'ambiguous'
      ? 'Voce tem mais de um cliente aguardando. Responda a notificacao desejada com CONFIRMAR ou envie o comando com o ID:\n' + result.chats.map(lead => lead.client_name + ': CONFIRMAR ' + lead.id).join('\n')
      : 'Nao foi possivel confirmar um lead pendente atribuido a voce. Verifique no painel; ele pode ter sido encaminhado a outro vendedor.';
  await send(reply);
  return true;
}

module.exports = { resolvePhone, confirmation, phoneJid, handleConfirmation };
