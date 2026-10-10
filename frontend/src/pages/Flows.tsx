import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { apiErrorMessage } from '../services/api';
import type { FlowSummary } from '../types';

export default function Flows() {
  const navigate = useNavigate();
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await api.get<FlowSummary[]>('/flows');
      setFlows(response.data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível carregar os fluxos.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca assincrona: o estado so muda depois do await
    load();
  }, [load]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    // Duplo clique/Enter duplicado nao pode criar dois fluxos.
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const response = await api.post<FlowSummary>('/flows', { name: name.trim() || 'Novo fluxo' });
      navigate(`/fluxos/${response.data.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível criar o fluxo.'));
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (flow: FlowSummary) => {
    setError('');
    try {
      await api.post(`/flows/${flow.id}/active`, { active: !flow.is_active });
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível alterar o status do fluxo.'));
    }
  };

  const remove = async (flow: FlowSummary) => {
    if (!confirm(`Excluir o fluxo "${flow.name}"? As respostas já captadas nas conversas são mantidas.`)) return;
    setError('');
    try {
      await api.delete(`/flows/${flow.id}`);
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Não foi possível excluir o fluxo.'));
    }
  };

  return (
    <div className="page">
      <h2 className="mb-2 text-2xl font-bold">Fluxos de atendimento</h2>
      <p className="mb-6 max-w-3xl text-gray-400">
        Monte as perguntas e menus que captam as informações do cliente. O fluxo ativo atende toda conversa nova no WhatsApp;
        ao terminar, a IA (se ligada) ou um atendente assume. Apenas um fluxo fica ativo por vez.
      </p>

      <form onSubmit={create} className="mb-6 flex max-w-xl gap-3 rounded-lg border border-gray-700 bg-gray-800 p-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 80))}
          placeholder="Nome do novo fluxo (ex.: Captação de leads)"
          className="flex-1 rounded-lg border border-gray-600 bg-gray-700 px-4 py-2 text-gray-50 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
        />
        <button type="submit" disabled={creating} className="rounded-lg bg-indigo-500 px-5 font-medium text-ink hover:bg-indigo-400 disabled:opacity-50">
          {creating ? 'Criando...' : '+ Novo fluxo'}
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-rose-400">{error}</p>}

      {loading ? (
        <p className="text-gray-400">Carregando...</p>
      ) : flows.length === 0 ? (
        <p className="text-gray-400">Nenhum fluxo criado ainda.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {flows.map(flow => (
            <div key={flow.id} className="rounded-lg border border-gray-700 bg-gray-800 p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <h3 className="font-bold text-gray-50">{flow.name}</h3>
                <span className={`rounded px-2 py-1 text-xs font-medium ${flow.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-600/40 text-gray-300'}`}>
                  {flow.is_active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <p className="mb-4 text-sm text-gray-400">
                {flow.node_count} {flow.node_count === 1 ? 'nó' : 'nós'} · atualizado em {new Date(flow.updated_at).toLocaleString('pt-BR')}
              </p>
              <div className="flex gap-2">
                <Link to={`/fluxos/${flow.id}`} className="flex-1 rounded bg-indigo-500 px-3 py-2 text-center text-sm font-medium text-ink hover:bg-indigo-400">Editar</Link>
                <button type="button" onClick={() => toggle(flow)} className="rounded border border-gray-600 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700">
                  {flow.is_active ? 'Desativar' : 'Ativar'}
                </button>
                <button type="button" onClick={() => remove(flow)} className="rounded border border-gray-600 px-3 py-2 text-sm text-gray-400 hover:bg-gray-700" aria-label={`Excluir ${flow.name}`}>Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
