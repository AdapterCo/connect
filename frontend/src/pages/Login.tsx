import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useAuthStore } from '../stores/authStore';
import { apiErrorMessage } from '../services/api';
import AuthShell from '../components/AuthShell';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [paymentUrl, setPaymentUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();

  if (isAuthenticated) {
    navigate('/dashboard', { replace: true });
    return null;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setPaymentUrl('');
    setIsLoading(true);

    try {
      await login(username, password);
      navigate('/dashboard');
    } catch (err) {
      const data = isAxiosError(err) ? err.response?.data as { payment_url?: string } | undefined : undefined;
      if (isAxiosError(err) && err.response?.status === 402 && data?.payment_url) {
        setPaymentUrl(data.payment_url);
      }
      setError(apiErrorMessage(err, 'Falha de conexão com o servidor.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell title="Entrar no painel" description="Use o usuário e a senha cadastrados pelo administrador da loja.">
      {error && (
        <div role="alert" className="mb-5 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
          {paymentUrl && (
            <a href={paymentUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-3 w-full">
              Concluir pagamento
            </a>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="login-username" className="mb-1.5 block text-sm font-medium text-gray-200">Usuário</label>
          <input
            id="login-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            autoFocus
            className="input"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <label htmlFor="login-password" className="text-sm font-medium text-gray-200">Senha</label>
            <Link to="/forgot-password" className="text-sm text-indigo-300 hover:text-indigo-200">Esqueci a senha</Link>
          </div>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="input"
          />
        </div>

        <button type="submit" disabled={isLoading} className="btn btn-primary w-full py-2.5">
          {isLoading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </AuthShell>
  );
}
