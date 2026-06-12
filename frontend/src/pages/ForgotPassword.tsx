import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function ForgotPassword() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      const res = await api.post('/password-reset/request', { username });
      setSuccess(true);
      if (res.data.token) {
        setResetToken(res.data.token);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao processar solicitação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="w-full max-w-md p-6">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-3xl font-bold text-white">A</span>
            </div>
            <h2 className="text-2xl font-bold text-white">Recuperar Senha</h2>
            <p className="text-gray-400 mt-2">Informe seu usuário para gerar um link de recuperação</p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          {success ? (
            <div className="text-center">
              <div className="text-4xl mb-4">📧</div>
              <h3 className="text-lg font-bold text-white mb-2">Link Gerado!</h3>
              <p className="text-gray-400 text-sm mb-4">
                Se o usuário existir, um link de recuperação foi gerado.
              </p>
              {resetToken && (
                <div className="bg-gray-700/50 border border-gray-600 rounded-lg p-4 mb-4">
                  <p className="text-xs text-gray-400 mb-2">Link de recuperação:</p>
                  <a
                    href={`/reset-password?token=${resetToken}`}
                    className="text-indigo-400 hover:text-indigo-300 text-sm break-all"
                  >
                    Clique aqui para redefinir sua senha
                  </a>
                </div>
              )}
              <Link
                to="/login"
                className="text-indigo-400 hover:text-indigo-300 text-sm"
              >
                Voltar ao Login
              </Link>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Nome de Usuário
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Ex: admin"
                    required
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? 'Processando...' : 'Gerar Link de Recuperação'}
                </button>
              </form>
              <div className="mt-4 text-center">
                <Link
                  to="/login"
                  className="text-indigo-400 hover:text-indigo-300 text-sm"
                >
                  Voltar ao Login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
