import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../services/api';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [step, setStep] = useState<'validate' | 'reset' | 'success'>('validate');
  const [error, setError] = useState('');
  const [userName, setUserName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      validateToken();
    } else {
      setLoading(false);
      setError('Token não fornecido.');
    }
  }, [token]);

  const validateToken = async () => {
    try {
      const res = await api.get(`/password-reset/validate/${token}`);
      if (res.data.valid) {
        setUserName(res.data.user.name);
        setStep('reset');
      } else {
        setError(res.data.error);
      }
    } catch {
      setError('Erro ao validar token.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Senha deve ter pelo menos 6 caracteres.');
      return;
    }

    try {
      await api.post('/password-reset/reset', { token, newPassword });
      setStep('success');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao alterar senha.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="w-full max-w-md p-6">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-3xl font-bold text-white">A</span>
            </div>
            <h2 className="text-2xl font-bold text-white">Adapter Connect</h2>
          </div>

          {error && step !== 'success' && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {step === 'reset' && (
            <>
              <p className="text-gray-400 text-sm mb-6 text-center">
                Olá, <span className="text-white font-medium">{userName}</span>. Defina sua nova senha.
              </p>
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Nova Senha</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Confirmar Nova Senha</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    required
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity"
                >
                  Alterar Senha
                </button>
              </form>
            </>
          )}

          {step === 'success' && (
            <div className="text-center">
              <div className="text-4xl mb-4">✅</div>
              <h3 className="text-lg font-bold text-white mb-2">Senha Alterada!</h3>
              <p className="text-gray-400 text-sm mb-6">Sua senha foi alterada com sucesso.</p>
              <Link
                to="/login"
                className="block w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity text-center"
              >
                Ir para Login
              </Link>
            </div>
          )}

          {error && step !== 'reset' && step !== 'success' && (
            <div className="text-center">
              <Link
                to="/login"
                className="text-indigo-400 hover:text-indigo-300 text-sm"
              >
                Voltar ao Login
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
