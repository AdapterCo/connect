import { create } from 'zustand';
import api from '../services/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateStatus: (status: 'online' | 'offline') => Promise<void>;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  initialize: () => {
    const token = localStorage.getItem('crm_token');
    const userStr = localStorage.getItem('crm_user');
    
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        set({ user, token, isAuthenticated: true, isLoading: false });
      } catch {
        set({ user: null, token: null, isAuthenticated: false, isLoading: false });
      }
    } else {
      set({ isLoading: false });
    }
  },

  login: async (username: string, password: string) => {
    const response = await api.post('/auth/login', { username, password });
    const { token, user } = response.data;
    
    localStorage.setItem('crm_token', token);
    localStorage.setItem('crm_user', JSON.stringify(user));
    
    set({ user, token, isAuthenticated: true });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    
    localStorage.removeItem('crm_token');
    localStorage.removeItem('crm_user');
    set({ user: null, token: null, isAuthenticated: false });
  },

  updateStatus: async (status: 'online' | 'offline') => {
    await api.post('/auth/status', { status });
    const user = get().user;
    if (user) {
      const updatedUser = { ...user, status };
      localStorage.setItem('crm_user', JSON.stringify(updatedUser));
      set({ user: updatedUser });
    }
  }
}));
