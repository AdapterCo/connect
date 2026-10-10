import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import api, { apiErrorMessage } from '../services/api';
import AuthShell from '../components/AuthShell';

export default function ForgotPassword() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      await api.post('/password-reset/request', { username });
      setSuccess(true);
    } catch (err) {
      setError(apiErrorMessage(err, 'Erro ao processar solicitação.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={success ? 'Confira seu e-mail' : 'Recuperar acesso'}
      description={success ? undefined : 'Informe seu usuário ou e-mail. Enviaremos um link para criar uma nova senha.'}
    >
      {error && (
        <div role="alert" className="mb-5 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {success ? (
        <div className="space-y-6">
          <p className="text-sm text-gray-300">
            Se a conta existir e tiver e-mail cadastrado, o link chega em instantes e vale por 1 hora.
            Sem e-mail cadastrado, peça ao administrador da loja para incluí-lo em Equipe.
          </p>
          <Link to="/login" className="btn btn-secondary w-full">Voltar para o login</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="forgot-identifier" className="mb-1.5 block text-sm font-medium text-gray-200">Usuário ou e-mail</label>
            <input
              id="forgot-identifier"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              className="input"
            />
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary w-full py-2.5">
            {loading ? 'Enviando...' : 'Enviar link'}
          </button>
          <Link to="/login" className="block text-center text-sm text-indigo-300 hover:text-indigo-200">Voltar para o login</Link>
        </form>
      )}
    </AuthShell>
  );
}
