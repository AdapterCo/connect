import { create } from 'zustand';
import api from '../services/api';
import type { Chat, Instance, Log, Settings, User } from '../types';

interface AppState {
  chats: Chat[];
  instances: Instance[];
  users: User[];
  logs: Log[];
  settings: Settings | null;
  selectedChatId: string | null;
  isLoading: boolean;

  setChats: (chats: Chat[]) => void;
  setInstances: (instances: Instance[]) => void;
  setUsers: (users: User[]) => void;
  setLogs: (logs: Log[]) => void;
  setSettings: (settings: Settings) => void;
  selectChat: (chatId: string | null) => void;

  fetchChats: () => Promise<void>;
  fetchInstances: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  fetchLogs: () => Promise<void>;
  fetchSettings: () => Promise<void>;

  sendMessage: (chatId: string, text: string, isNote?: boolean, mediaUrl?: string, mediaType?: string, fileName?: string) => Promise<void>;
  updateChatStatus: (chatId: string, status: Chat['status']) => Promise<void>;
  assignChat: (chatId: string, userId: string | null) => Promise<void>;
  toggleAi: (chatId: string, aiActive: boolean) => Promise<void>;
  updateSector: (chatId: string, sector: Chat['sector']) => Promise<void>;
  toggleFavorite: (chatId: string, isFavorite: boolean) => Promise<void>;
  toggleArchive: (chatId: string, isArchived: boolean) => Promise<void>;
  toggleBlock: (chatId: string, isBlocked: boolean) => Promise<void>;
  addTag: (chatId: string, tag: string) => Promise<void>;
  deleteTag: (chatId: string, tag: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  chats: [],
  instances: [],
  users: [],
  logs: [],
  settings: null,
  selectedChatId: null,
  isLoading: false,

  setChats: (chats) => set({ chats }),
  setInstances: (instances) => set({ instances }),
  setUsers: (users) => set({ users }),
  setLogs: (logs) => set({ logs }),
  setSettings: (settings) => set({ settings }),
  selectChat: (chatId) => set({ selectedChatId: chatId }),

  fetchChats: async () => {
    const response = await api.get('/chats');
    set({ chats: response.data });
  },

  fetchInstances: async () => {
    const response = await api.get('/instances');
    set({ instances: response.data });
  },

  fetchUsers: async () => {
    const response = await api.get('/users');
    set({ users: response.data });
  },

  fetchLogs: async () => {
    const response = await api.get('/logs');
    set({ logs: response.data });
  },

  fetchSettings: async () => {
    const response = await api.get('/settings');
    set({ settings: response.data });
  },

  sendMessage: async (chatId, text, isNote = false, mediaUrl, mediaType, fileName) => {
    await api.post(`/chats/${chatId}/message`, { text, isNote, mediaUrl, mediaType, fileName });
    await get().fetchChats();
  },

  updateChatStatus: async (chatId, status) => {
    await api.put(`/chats/${chatId}/status`, { status });
    await get().fetchChats();
  },

  assignChat: async (chatId, userId) => {
    await api.put(`/chats/${chatId}/assign`, { userId });
    await get().fetchChats();
  },

  toggleAi: async (chatId, aiActive) => {
    await api.put(`/chats/${chatId}/ai`, { aiActive });
    await get().fetchChats();
  },

  updateSector: async (chatId, sector) => {
    await api.put(`/chats/${chatId}/sector`, { sector });
    await get().fetchChats();
  },

  toggleFavorite: async (chatId, isFavorite) => {
    await api.put(`/chats/${chatId}/favorite`, { isFavorite });
    await get().fetchChats();
  },

  toggleArchive: async (chatId, isArchived) => {
    await api.put(`/chats/${chatId}/archive`, { isArchived });
    await get().fetchChats();
  },

  toggleBlock: async (chatId, isBlocked) => {
    await api.put(`/chats/${chatId}/block`, { isBlocked });
    await get().fetchChats();
  },

  addTag: async (chatId, tag) => {
    await api.post(`/chats/${chatId}/tags`, { tag });
    await get().fetchChats();
  },

  deleteTag: async (chatId, tag) => {
    await api.delete(`/chats/${chatId}/tags`, { data: { tag } });
    await get().fetchChats();
  }
}));
