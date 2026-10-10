import { useEffect, useState } from 'react';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';

export default function WhatsApp() {
  const { instances, fetchInstances, users, fetchUsers } = useAppStore();
  const currentUser = useAuthStore((state) => state.user);
  const [newInstanceName, setNewInstanceName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [qrInstanceId, setQrInstanceId] = useState<string | null>(null);
  const qrInstance = instances.find(i => i.id === qrInstanceId);
  const showQr = qrInstanceId !== null && qrInstance?.status !== 'open';
  const isManager = currentUser?.role === 'admin' || currentUser?.role === 'supervisor';

  useEffect(() => {
    fetchInstances();
    fetchUsers();
    // Reconcile missed socket events and refresh when returning to this tab.
    const refresh = () => { if (!document.hidden) fetchInstances().catch(() => {}); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [fetchInstances, fetchUsers]);

  const handleCreate = async () => {
    if (!newInstanceName.trim()) return;
    await api.post('/instances', { name: newInstanceName, user_id: selectedUserId || null });
    setNewInstanceName('');
    setSelectedUserId('');
    fetchInstances();
  };

  const handleConnect = async (instanceId: string) => {
    await api.post(`/instances/${instanceId}/connect`);
    setQrInstanceId(instanceId);
  };

  const handleDisconnect = async (instanceId: string) => {
    await api.post(`/instances/${instanceId}/disconnect`);
    setQrInstanceId(null);
    fetchInstances();
  };

  const handleDelete = async (instanceId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta conexão?')) return;
    await api.delete(`/instances/${instanceId}`);
    setQrInstanceId(null);
    fetchInstances();
  };

  const handleAssignUser = async (instanceId: string, userId: string) => {
    await api.patch(`/instances/${instanceId}/assign`, { user_id: userId || null });
    fetchInstances();
  };

  return (
    <div className="page">
      <h2 className="text-2xl font-bold mb-2">Conexões WhatsApp</h2>
      <p className="text-gray-400 mb-6">Cadastre e gerencie múltiplos chips de WhatsApp integrados ao CRM.</p>

      {isManager && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={newInstanceName}
              onChange={(e) => setNewInstanceName(e.target.value)}
              placeholder="Ex: WhatsApp Vendas, Suporte RJ..."
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            >
              <option value="">Geral da Empresa (Triagem)</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
              ))}
            </select>
            <button
              onClick={handleCreate}
              className="px-6 bg-indigo-500 text-gray-950 rounded-lg font-medium hover:bg-indigo-400 whitespace-nowrap"
            >
              Adicionar Conexão
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {instances.map(instance => (
          <div key={instance.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white">{instance.name}</h3>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                instance.status === 'open' ? 'bg-green-500/20 text-green-400' :
                instance.status === 'connecting' || instance.status === 'qr' ? 'bg-amber-500/20 text-amber-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {instance.status === 'open' ? 'Conectado' : instance.status === 'connecting' ? 'Conectando' : instance.status === 'qr' ? 'Aguardando QR' : 'Desconectado'}
              </span>
            </div>

            {instance.phone && (
              <p className="text-sm text-gray-400 mb-2">+{instance.phone}</p>
            )}

            <div className="mb-3">
              {isManager ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 whitespace-nowrap">Vendedor:</span>
                  <select
                    value={instance.user_id || ''}
                    onChange={(e) => handleAssignUser(instance.id, e.target.value)}
                    className="w-full bg-gray-700/80 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Geral da Empresa</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-xs text-gray-400">
                  Atendente: {users.find(u => u.id === instance.user_id)?.name || 'Geral da Empresa'}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              {instance.status !== 'open' ? (
                <button
                  onClick={() => handleConnect(instance.id)}
                  className="flex-1 px-3 py-2 bg-indigo-500 text-gray-950 rounded text-sm font-medium hover:bg-indigo-400"
                >
                  Conectar
                </button>
              ) : (
                <button
                  onClick={() => handleDisconnect(instance.id)}
                  className="flex-1 px-3 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700"
                >
                  Desconectar
                </button>
              )}
              <button
                onClick={() => handleDelete(instance.id)}
                className="px-3 py-2 border border-gray-600 text-gray-400 rounded text-sm hover:bg-gray-700"
              >Excluir</button>
            </div>
          </div>
        ))}
      </div>

      {showQr && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Conectar WhatsApp</h3>
              <button onClick={() => setQrInstanceId(null)} className="text-gray-400 hover:text-white text-2xl">×</button>
            </div>

            {qrInstance?.qr ? (
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-4">
                  Abra o WhatsApp no celular → Aparelhos Conectados → Conectar Aparelho
                </p>
                <div className="bg-white p-4 rounded-lg inline-block mb-4">
                  <img src={qrInstance.qr} alt="QR Code" className="w-56 h-56" />
                </div>
                <p className="text-sm text-indigo-400 font-medium">Aguardando leitura...</p>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mx-auto mb-4"></div>
                <p className="text-gray-400">Carregando QR Code...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
