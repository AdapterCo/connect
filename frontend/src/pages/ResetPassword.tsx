import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../services/api';
import AuthShell from '../components/AuthShell';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [step, setStep] = useState<'validate' | 'reset' | 'success'>('validate');
  const [error, setError] = useState(token ? '' : 'Token não fornecido.');
  const [userName, setUserName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) return;
    api.get(`/password-reset/validate/${token}`)
      .then((res) => {
        if (res.data.valid) {
          setUserName(res.data.user.name);
          setStep('reset');
        } else {
          setError(res.data.error);
        }
      })
      .catch(() => setError('Erro ao validar token.'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    if (newPassword.length < 8) {
      setError('Senha deve ter pelo menos 8 caracteres.');
      return;
    }

    try {
      await api.post('/password-reset/reset', { token, newPassword });
      setStep('success');
    } catch (err) {
      setError(apiErrorMessage(err, 'Erro ao alterar senha.'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <p className="text-sm text-gray-400">Verificando o link...</p>
      </div>
    );
  }

  return (
    <AuthShell
      title={step === 'success' ? 'Senha alterada' : 'Criar nova senha'}
      description={step === 'reset' ? `Olá, ${userName}. A nova senha precisa ter pelo menos 8 caracteres.` : undefined}
    >
      {error && step !== 'success' && (
        <div role="alert" className="mb-5 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {step === 'reset' && (
        <form onSubmit={handleReset} className="space-y-5">
          <div>
            <label htmlFor="reset-password" className="mb-1.5 block text-sm font-medium text-gray-200">Nova senha</label>
            <input
              id="reset-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              maxLength={128}
              required
              autoComplete="new-password"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="reset-confirm" className="mb-1.5 block text-sm font-medium text-gray-200">Repita a nova senha</label>
            <input
              id="reset-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="input"
            />
          </div>
          <button type="submit" className="btn btn-primary w-full py-2.5">Salvar nova senha</button>
        </form>
      )}

      {step === 'success' && (
        <div className="space-y-6">
          <p className="text-sm text-gray-300">Use a nova senha para entrar. As sessões abertas em outros aparelhos foram encerradas.</p>
          <Link to="/login" className="btn btn-primary w-full py-2.5">Ir para o login</Link>
        </div>
      )}

      {error && step !== 'reset' && step !== 'success' && (
        <Link to="/forgot-password" className="btn btn-secondary w-full">Pedir um novo link</Link>
      )}
    </AuthShell>
  );
}
