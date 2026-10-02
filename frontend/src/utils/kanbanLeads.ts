import type { Chat } from '../types';

// Origin and seller conversations belong to different fixed stages.
export function kanbanLeads(chats: Chat[]): Chat[] {
  return chats.filter(chat => !chat.is_archived && !chat.is_blocked).map(chat => {
    // Compatible with already captured records from previous deployments.
    if (chat.status === 'interesse em compra' && chat.assigned_to && !chat.sales_reply_due_at) {
      return { ...chat, status: chat.instance?.user_id ? 'em atendimento' : 'encaminhados' };
    }
    return chat;
  });
}
