import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import api, { apiErrorMessage } from '../services/api';
import type { User } from '../types';

const emptyForm = { name: '', username: '', email: '', phone: '', password: '', role: 'seller', sector: 'sales' };

export default function Team() {
  const { users, instances, fetchUsers, fetchInstances } = useAppStore();
  const currentUser = useAuthStore((state) => state.user);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUsers();
    fetchInstances();
  }, [fetchUsers, fetchInstances]);

  const handleCreate = async () => {
    setError('');
    try {
      await api.post('/auth/register', formData);
      setFormData(emptyForm);
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      setError(apiErrorMessage(err, 'Erro ao cadastrar atendente.'));
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Tem certeza que deseja excluir este atendente?')) return;
    await api.delete(`/users/${userId}`);
    fetchUsers();
  };

  const canEditEmail = (user: User) => currentUser?.role === 'admin' || user.id === currentUser?.id ||
    (currentUser?.role === 'supervisor' && !['admin', 'supervisor'].includes(user.role));

  const handleEmail = async (user: User) => {
    const email = prompt(`E-mail de ${user.name} (usado para recuperar a senha). Deixe vazio para remover.`, user.email || '');
    if (email === null) return;
    setError('');
    try {
      await api.patch(`/users/${user.id}/email`, { email: email.trim() });
      fetchUsers();
    } catch (err) {
      setError(apiErrorMessage(err, 'Erro ao atualizar e-mail.'));
    }
  };

  const canEditPhone = (user: User) => currentUser?.role === 'admin' || user.id === currentUser?.id ||
    (currentUser?.role === 'supervisor' && !['admin', 'supervisor'].includes(user.role));

  const handlePhone = async (user: User) => {
    const phone = prompt(`WhatsApp/Telefone de ${user.name} (ex: 21985080634). Deixe vazio para remover.`, user.phone || '');
    if (phone === null) return;
    setError('');
    try {
      await api.patch(`/users/${user.id}/phone`, { phone: phone.trim() });
      fetchUsers();
    } catch (err) {
      setError(apiErrorMessage(err, 'Erro ao atualizar telefone.'));
    }
  };

  const canEditSector = (_user?: User) => currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const handleSector = async (user: User) => {
    const newSector = prompt(`Setor de ${user.name} (sales = Vendas, support = Suporte, finance = Financeiro):`, user.sector || (user.role === 'seller' ? 'sales' : (user.role === 'support' ? 'support' : 'finance')));
    if (!newSector || !['sales', 'support', 'finance'].includes(newSector.trim())) return;
    setError('');
    try {
      await api.patch(`/users/${user.id}/sector`, { sector: newSector.trim() });
      fetchUsers();
    } catch (err) {
      setError(apiErrorMessage(err, 'Erro ao atualizar setor.'));
    }
  };

  const canToggleStatus = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';
  const handleToggleStatus = async (user: User) => {
    if (!canToggleStatus && user.id !== currentUser?.id) return;
    const newStatus = user.status === 'online' ? 'offline' : 'online';
    try {
      await api.patch(`/users/${user.id}/status`, { status: newStatus });
      fetchUsers();
    } catch (err) {
      setError(apiErrorMessage(err, 'Erro ao alterar status.'));
    }
  };

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    supervisor: 'Supervisor',
    seller: 'Vendedor',
    support: 'Suporte',
    other: 'Outro'
  };

  const sectorLabels: Record<string, string> = {
    sales: 'Vendas',
    support: 'Suporte',
    finance: 'Financeiro'
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

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {showForm && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-6 max-w-md">
          <h3 className="font-bold text-white mb-4">Cadastrar Novo Atendente</h3>
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
              type="email"
              placeholder="E-mail (para recuperar a senha)"
              maxLength={254}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <input
              type="text"
              placeholder="WhatsApp / Telefone (ex: 21985080634)"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <input
              type="password"
              placeholder="Senha Provisória (mín. 8 caracteres)"
              minLength={8}
              maxLength={128}
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={formData.role}
                onChange={(e) => {
                  const role = e.target.value;
                  const defaultSector = role === 'seller' ? 'sales' : role === 'support' ? 'support' : role === 'other' ? 'finance' : formData.sector;
                  setFormData({ ...formData, role, sector: defaultSector });
                }}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="seller">Vendedor</option>
                <option value="support">Suporte</option>
                <option value="other">Outro</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Administrador</option>
              </select>

              <select
                value={formData.sector}
                onChange={(e) => setFormData({ ...formData, sector: e.target.value })}
                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="sales">Setor: Vendas</option>
                <option value="support">Setor: Suporte</option>
                <option value="finance">Setor: Financeiro</option>
              </select>
            </div>
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
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">WhatsApp</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">E-mail</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Função</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Setor</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Status</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-gray-700/30">
                <td className="px-4 py-3 text-white">{user.name}</td>
                <td className="px-4 py-3 text-gray-400">{user.username}</td>
                <td className="px-4 py-3 text-gray-400">
                  {user.phone ? `+${user.phone}` : <span className="text-gray-500 text-sm">sem WhatsApp</span>}
                  {(() => {
                    const uPhone = user.phone ? user.phone.replace(/\D/g, '') : '';
                    const inst = instances.find(i => i.user_id === user.id || (uPhone && i.phone && (i.phone.replace(/\D/g, '') === uPhone || i.phone.replace(/\D/g, '').endsWith(uPhone))));
                    return inst ? (
                      <div className="mt-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-indigo-300 border border-gray-600 inline-block">
                          📱 {inst.name}
                        </span>
                      </div>
                    ) : null;
                  })()}
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {user.email || <span className="text-amber-300/80 text-sm">sem e-mail</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded text-xs">
                    {roleLabels[user.role] || user.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs">
                    {sectorLabels[user.sector || (user.role === 'seller' ? 'sales' : (user.role === 'support' ? 'support' : 'finance'))] || 'Vendas'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleStatus(user)}
                    title={canToggleStatus ? 'Clique para alternar online/offline' : undefined}
                    className={`inline-flex items-center gap-1 text-sm ${user.status === 'online' ? 'text-green-400' : 'text-gray-500'} ${canToggleStatus ? 'hover:underline cursor-pointer' : ''}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${user.status === 'online' ? 'bg-green-400' : 'bg-gray-500'}`} />
                    {user.status}
                  </button>
                </td>
                <td className="px-4 py-3 text-right space-x-3">
                  {canEditSector(user) && (
                    <button onClick={() => handleSector(user)} className="text-amber-400 hover:text-amber-300 text-sm">
                      Setor
                    </button>
                  )}
                  {canEditPhone(user) && (
                    <button onClick={() => handlePhone(user)} className="text-emerald-400 hover:text-emerald-300 text-sm">
                      WhatsApp
                    </button>
                  )}
                  {canEditEmail(user) && (
                    <button onClick={() => handleEmail(user)} className="text-indigo-300 hover:text-indigo-200 text-sm">
                      E-mail
                    </button>
                  )}
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
