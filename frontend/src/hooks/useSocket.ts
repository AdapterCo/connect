import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';
import type { Chat } from '../types';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const token = useAuthStore((state) => state.token);
  const setChats = useAppStore((state) => state.setChats);
  const setUsers = useAppStore((state) => state.setUsers);
  const setLogs = useAppStore((state) => state.setLogs);
  const setInstances = useAppStore((state) => state.setInstances);
  const fetchInstances = useAppStore((state) => state.fetchInstances);
  // PERFORMANCE: updateChat para processar eventos granulares 'chat_updated'
  const updateChat = useAppStore((state) => state.updateChat);

  useEffect(() => {
    if (!token) return;

    const socket = io(window.location.origin, {
      auth: { token }
    });

    socketRef.current = socket;

    // Evento de lista completa — usado apenas para criação/remoção de chats
    socket.on('chats_updated', (chats) => {
      setChats(chats);
    });

    // PERFORMANCE: Evento granular — atualiza apenas o chat modificado.
    // Evita substituir todos os chats no estado a cada mensagem recebida.
    socket.on('chat_updated', (chat: Chat) => {
      updateChat(chat);
    });

    socket.on('users_updated', (users) => {
      setUsers(users);
    });

    socket.on('logs_updated', (logs) => {
      setLogs(logs);
    });

    socket.on('whatsapp_status_updated', () => {
      fetchInstances();
    });

    return () => {
      socket.disconnect();
    };
  }, [token, setChats, updateChat, setUsers, setLogs, setInstances, fetchInstances]);

  return socketRef.current;
}
