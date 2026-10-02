import type { Chat } from '../types';

// Conversations stay separate; only the board represents a lead once.
export function kanbanLeads(chats: Chat[]): Chat[] {
  const leads = new Map<string, Chat>();
  for (const chat of chats) {
    if (chat.is_archived || chat.is_blocked) continue;
    const digits = chat.client_phone.replace(/\D/g, '');
    const phone = digits.length === 10 || digits.length === 11 ? '55' + digits : digits;
    const knownPhone = !chat.remote_jid?.endsWith('@lid') || phone.length <= 13;
    const key = knownPhone && phone.length >= 10 && phone.length <= 15
      ? `${chat.company_id}:${phone}:${chat.assigned_to || ''}:${chat.status}` : chat.id;
    const current = leads.get(key);
    if (!current || (current.instance?.user_id && !chat.instance?.user_id)) leads.set(key, chat);
  }
  return [...leads.values()];
}
