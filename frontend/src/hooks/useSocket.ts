import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import api from '../services/api';
import { notifyLead } from '../services/leadAlerts';
import type { Chat } from '../types';

export function useSocket() {
  // A conexao autentica pelo cookie HttpOnly de sessao; reconecta ao trocar de usuario.
  const userId = useAuthStore((state) => state.user?.id);
  const setChats = useAppStore((state) => state.setChats);
  const setUsers = useAppStore((state) => state.setUsers);
  const setLogs = useAppStore((state) => state.setLogs);
  const setInstances = useAppStore((state) => state.setInstances);
  const fetchInstances = useAppStore((state) => state.fetchInstances);
  // PERFORMANCE: updateChat para processar eventos granulares 'chat_updated'
  const updateChat = useAppStore((state) => state.updateChat);

  useEffect(() => {
    if (!userId) return;

    let disposed = false;
    const socket = io(window.location.origin, { withCredentials: true });
    socket.on('disconnect', async reason => {
      if (reason !== 'io server disconnect' || disposed) return;
      useAppStore.getState().reset();
      await useAuthStore.getState().initialize();
      const auth = useAuthStore.getState();
      if (!disposed && auth.isAuthenticated && !auth.sessionError && !auth.user?.requires_payment) socket.connect();
    });


    socket.on('connect', () => {
      useAppStore.getState().fetchChats().catch(() => {});
      fetchInstances().catch(() => {});
    });
    socket.on('connect_error', () => {
      api.get('/auth/me').then(response => {
        if (response.data.user?.requires_payment) { socket.disconnect(); useAuthStore.getState().initialize(); }
      }).catch(error => {
        if ([401, 403].includes(error.response?.status)) { socket.disconnect(); useAuthStore.getState().initialize(); }
      });
    });
    // Evento de lista completa — usado apenas para criação/remoção de chats
    socket.on('chats_updated', (chats) => {
      setChats(chats);
    });

    // PERFORMANCE: Evento granular — atualiza apenas o chat modificado.
    // Evita substituir todos os chats no estado a cada mensagem recebida.
    socket.on('chat_updated', (chat: Chat) => {
      const previous = useAppStore.getState().chats.find(item => item.id === chat.id);
      const user = useAuthStore.getState().user;
      const last = chat.messages[chat.messages.length - 1];
      const previousLast = previous?.messages[previous.messages.length - 1];
      if (chat.assigned_to === user?.id && (previous?.assigned_to !== user?.id || (last?.sender === 'client' && last?.id !== previousLast?.id))) notifyLead('Novo atendimento');
      updateChat(chat);
    });

    socket.on('chat_removed', ({ id }: { id: string }) => useAppStore.getState().removeChat(id));

    socket.on('users_updated', (users) => {
      setUsers(users);
    });

    socket.on('logs_updated', (logs) => {
      setLogs(logs);
    });

    socket.on('whatsapp_status_updated', () => {
      fetchInstances().catch(() => {});
    });

    return () => {
      disposed = true;
      socket.disconnect();
    };
  }, [userId, setChats, updateChat, setUsers, setLogs, setInstances, fetchInstances]);

}
