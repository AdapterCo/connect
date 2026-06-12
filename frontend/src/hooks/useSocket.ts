import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const token = useAuthStore((state) => state.token);
  const setChats = useAppStore((state) => state.setChats);
  const setUsers = useAppStore((state) => state.setUsers);
  const setLogs = useAppStore((state) => state.setLogs);
  const setInstances = useAppStore((state) => state.setInstances);
  const fetchInstances = useAppStore((state) => state.fetchInstances);

  useEffect(() => {
    if (!token) return;

    const socket = io(window.location.origin, {
      auth: { token }
    });

    socketRef.current = socket;

    socket.on('chats_updated', (chats) => {
      setChats(chats);
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
  }, [token, setChats, setUsers, setLogs, setInstances, fetchInstances]);

  return socketRef.current;
}
