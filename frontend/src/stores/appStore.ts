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
  reset: () => void;

  // PERFORMANCE: Nova ação para atualização granular de um único chat (via evento socket 'chat_updated')
  updateChat: (chat: Chat) => void;

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
  reset: () => set({
    chats: [],
    instances: [],
    users: [],
    logs: [],
    settings: null,
    selectedChatId: null,
    isLoading: false
  }),

  // PERFORMANCE: Atualiza apenas o chat específico no estado local sem re-fetch HTTP
  updateChat: (updatedChat) => set((state) => ({
    chats: state.chats.map((c) => c.id === updatedChat.id ? updatedChat : c)
  })),

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

  // PERFORMANCE: Ações não chamam mais fetchChats() após cada operação.
  // O evento socket 'chat_updated' retornado pelo backend atualiza o estado via updateChat().
  // Isso elimina 9 requisições HTTP desnecessárias a cada interação com chats.

  sendMessage: async (chatId, text, isNote = false, mediaUrl, mediaType, fileName) => {
    await api.post(`/chats/${chatId}/message`, { text, isNote, mediaUrl, mediaType, fileName });
    // Socket event 'chat_updated' irá atualizar o estado via useSocket
  },

  updateChatStatus: async (chatId, status) => {
    const response = await api.post(`/chats/${chatId}/status`, { status });
    // Atualização otimista a partir da resposta da API
    if (response.data?.chat) get().updateChat(response.data.chat);
  },

  assignChat: async (chatId, userId) => {
    const response = await api.post(`/chats/${chatId}/assign`, { userId });
    if (response.data?.chat) get().updateChat(response.data.chat);
  },

  toggleAi: async (chatId, aiActive) => {
    const response = await api.post(`/chats/${chatId}/ai-toggle`, { aiActive });
    if (response.data?.chat) get().updateChat(response.data.chat);
  },

  updateSector: async (chatId, sector) => {
    const response = await api.post(`/chats/${chatId}/sector`, { sector });
    if (response.data?.chat) get().updateChat(response.data.chat);
  },

  toggleFavorite: async (chatId, isFavorite) => {
    const response = await api.post(`/chats/${chatId}/favorite`, { isFavorite });
    if (response.data?.chat) get().updateChat(response.data.chat);
  },

  toggleArchive: async (chatId, isArchived) => {
    const response = await api.post(`/chats/${chatId}/archive`, { isArchived });
    if (response.data?.chat) get().updateChat(response.data.chat);
  },

  toggleBlock: async (chatId, isBlocked) => {
    const response = await api.post(`/chats/${chatId}/block`, { isBlocked });
    if (response.data?.chat) get().updateChat(response.data.chat);
  },

  addTag: async (chatId, tag) => {
    const response = await api.post(`/chats/${chatId}/tags`, { tag });
    if (response.data?.chat) get().updateChat(response.data.chat);
  },

  deleteTag: async (chatId, tag) => {
    const response = await api.delete(`/chats/${chatId}/tags`, { data: { tag } });
    if (response.data?.chat) get().updateChat(response.data.chat);
  }
}));
