import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import api from '../services/api';

export default function Team() {
  const { users, fetchUsers } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', username: '', password: '', role: 'seller' });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleCreate = async () => {
    setError('');
    try {
      await api.post('/auth/register', formData);
      setFormData({ name: '', username: '', password: '', role: 'seller' });
      setShowForm(false);
      fetchUsers();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao cadastrar atendente.');
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Tem certeza que deseja excluir este atendente?')) return;
    await api.delete(`/users/${userId}`);
    fetchUsers();
  };

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    supervisor: 'Supervisor',
    seller: 'Vendedor',
    support: 'Suporte',
    other: 'Outro'
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Gestão de Equipe</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
        >
          {showForm ? 'Cancelar' : '➕ Novo Atendente'}
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-6 max-w-md">
          <h3 className="font-bold text-white mb-4">Cadastrar Novo Atendente</h3>
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Nome Completo"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              placeholder="Usuário (Login)"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <input
              type="password"
              placeholder="Senha Provisória"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="seller">Vendedor</option>
              <option value="support">Suporte</option>
              <option value="other">Outro</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Administrador</option>
            </select>
            <button
              onClick={handleCreate}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700"
            >
              Cadastrar
            </button>
          </div>
        </div>
      )}

      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700/50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Nome</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Usuário</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Função</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Status</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-gray-700/30">
                <td className="px-4 py-3 text-white">{user.name}</td>
                <td className="px-4 py-3 text-gray-400">{user.username}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded text-xs">
                    {roleLabels[user.role] || user.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 text-sm ${user.status === 'online' ? 'text-green-400' : 'text-gray-500'}`}>
                    <span className={`w-2 h-2 rounded-full ${user.status === 'online' ? 'bg-green-400' : 'bg-gray-500'}`} />
                    {user.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(user.id)}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
