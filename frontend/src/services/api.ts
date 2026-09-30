import axios from 'axios';

// A autenticacao usa o cookie HttpOnly 'crm_session', enviado automaticamente
// pelo navegador (mesma origem). Nenhum token e lido ou gravado pelo JavaScript.
const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

const PUBLIC_PATHS = ['/', '/login', '/forgot-password', '/reset-password'];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = String(error.config?.url || '');
    // Falha de login ou de verificacao de sessao e tratada por quem chamou.
    const isAuthCheck = url.startsWith('/auth/login') || url.startsWith('/auth/me');
    if (error.response?.status === 401 && !isAuthCheck) {
      localStorage.removeItem('crm_user');
      if (!PUBLIC_PATHS.includes(window.location.pathname)) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Mensagem de erro devolvida pela API ({ error }) ou o texto padrao informado.
export function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: unknown } | undefined;
    if (typeof data?.error === 'string' && data.error) return data.error;
  }
  return fallback;
}

export default api;
