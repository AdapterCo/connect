import { useEffect, useState } from 'react';
import api from '../services/api';

interface AuditLog {
  id: string;
  user_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: string | null;
  ip: string | null;
  timestamp: string;
}

interface AuditResponse {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const actionLabels: Record<string, string> = {
  login: 'Login',
  logout: 'Logout',
  create: 'Criar',
  delete: 'Excluir',
  update: 'Atualizar',
  update_status: 'Alterar Status',
  send_message: 'Enviar Mensagem',
  assign: 'Atribuir',
  toggle_ai: 'Alternar IA',
  toggle_favorite: 'Favoritar',
  toggle_archive: 'Arquivar',
  toggle_block: 'Bloquear',
  add_tag: 'Adicionar Tag',
  delete_tag: 'Remover Tag',
  update_sector: 'Alterar Setor',
  connect: 'Conectar',
  disconnect: 'Desconectar',
  register_tenant: 'Registrar Empresa'
};

const entityLabels: Record<string, string> = {
  auth: 'Autenticação',
  chat: 'Chat',
  instance: 'Conexão',
  user: 'Usuário',
  settings: 'Configurações',
  company: 'Empresa'
};

const actionColors: Record<string, string> = {
  login: 'bg-green-500/20 text-green-400',
  logout: 'bg-gray-500/20 text-gray-400',
  create: 'bg-blue-500/20 text-blue-400',
  delete: 'bg-red-500/20 text-red-400',
  update: 'bg-amber-500/20 text-amber-400',
  update_status: 'bg-amber-500/20 text-amber-400',
  send_message: 'bg-indigo-500/20 text-indigo-400',
  assign: 'bg-purple-500/20 text-purple-400',
  connect: 'bg-green-500/20 text-green-400',
  disconnect: 'bg-red-500/20 text-red-400'
};

export default function Logs() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, [page, actionFilter, entityFilter]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (actionFilter) params.action = actionFilter;
      if (entityFilter) params.entity = entityFilter;

      const res = await api.get('/audit/logs', { params });
      setData(res.data);
    } catch (error) {
      console.error('Erro ao buscar logs:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Auditoria</h2>
        {data && (
          <span className="text-sm text-gray-400">
            {data.total} registro(s) encontrado(s)
          </span>
        )}
      </div>

      <div className="flex gap-3 mb-4">
        <select
          value={entityFilter}
          onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
          className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">Todas as Entidades</option>
          {Object.entries(entityLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">Todas as Ações</option>
          {Object.entries(actionLabels).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
          <table className="w-full text-sm">
            <thead className="bg-gray-700/50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 text-gray-400">Data/Hora</th>
                <th className="text-left px-4 py-3 text-gray-400">Usuário</th>
                <th className="text-left px-4 py-3 text-gray-400">Entidade</th>
                <th className="text-left px-4 py-3 text-gray-400">Ação</th>
                <th className="text-left px-4 py-3 text-gray-400">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Carregando...
                  </td>
                </tr>
              ) : !data || data.logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Nenhum log encontrado
                  </td>
                </tr>
              ) : (
                data.logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-700/30">
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-white">
                      {log.user_name || 'Sistema'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs">
                        {entityLabels[log.entity] || log.entity}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${actionColors[log.action] || 'bg-gray-500/20 text-gray-400'}`}>
                        {actionLabels[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {log.ip || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-gray-400">
            Página {data.page} de {data.totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages}
            className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm text-white disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
