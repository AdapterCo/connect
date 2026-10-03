import axios from 'axios';
import { create } from 'zustand';
import api from '../services/api';
import type { User } from '../types';
import { useAppStore } from './appStore';
import { disableWebPush } from '../services/webPush';

// A sessao fica num cookie HttpOnly definido pelo backend: o token nunca e
// acessivel ao JavaScript. Aqui guardamos apenas os dados do usuario.
const USER_KEY = 'crm_user';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionError: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateStatus: (status: 'online' | 'offline') => Promise<void>;
  initialize: () => Promise<void>;
}

function storeUser(user: User | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  sessionError: null,

  initialize: async () => {
    // Remove o token salvo por versoes anteriores.
    localStorage.removeItem('crm_token');
    set({ isLoading: true, sessionError: null });


    try {
      const response = await api.get('/auth/me');
      storeUser(response.data.user);
      set({ user: response.data.user, isAuthenticated: true, isLoading: false, sessionError: null });
    } catch (error) {
      if (!axios.isAxiosError(error) || ![401, 403].includes(error.response?.status || 0)) {
        set({ isLoading: false, sessionError: 'Nao foi possivel verificar sua sessao. Tente novamente.' });
        return;
      }
      storeUser(null);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  login: async (username: string, password: string) => {
    useAppStore.getState().reset();
    storeUser(null);

    const response = await api.post('/auth/login', { username, password });
    const { user } = response.data;

    storeUser(user);
    set({ user, isAuthenticated: true });
  },

  logout: async () => {
    try {
      await disableWebPush().catch(() => {});
      await api.post('/auth/logout');
    } catch {
      // ignore
    }

    storeUser(null);
    useAppStore.getState().reset();
    set({ user: null, isAuthenticated: false });
  },

  updateStatus: async (status: 'online' | 'offline') => {
    await api.post('/auth/status', { status });
    const user = get().user;
    if (user) {
      const updatedUser = { ...user, status };
      storeUser(updatedUser);
      set({ user: updatedUser });
    }
  }
}));
