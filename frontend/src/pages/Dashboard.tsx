import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore } from '../stores/appStore';
import { useAuthStore } from '../stores/authStore';
import { kanbanLeads } from '../utils/kanbanLeads';
import type { Chat } from '../types';

// Etapas do funil, na ordem em que o cliente percorre.
const STAGES: { status: Chat['status']; label: string; hint: string }[] = [
  { status: 'iniciada', label: 'Iniciada', hint: 'Primeiro contato' },
  { status: 'interesse em compra', label: 'Interesse em compra', hint: 'No rodízio de vendedores' },
  { status: 'encaminhados', label: 'Encaminhados', hint: 'Com vendedor definido' },
  { status: 'em atendimento', label: 'Em atendimento', hint: 'Negociação em andamento' },
  { status: 'finalizada', label: 'Finalizada', hint: 'Venda concluída ou encerrada' }
];

// A partir deste tempo de espera o cliente aparece em destaque (ambar).
const LONG_WAIT_MS = 5 * 60 * 1000;

function waitingLabel(since: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ${minutes % 60} min` : `${Math.floor(hours / 24)} d`;
}

export default function Dashboard() {
  const { chats, logs, fetchChats, fetchLogs, selectChat } = useAppStore();
  const isManager = useAuthStore((state) => ['admin', 'supervisor'].includes(state.user?.role ?? ''));
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetchChats();
    // O log da empresa e restrito a gestores no backend.
    if (isManager) fetchLogs();
  }, [fetchChats, fetchLogs, isManager]);

  // Atualiza os tempos de espera a cada 30 segundos.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const leads = kanbanLeads(chats);
  const counts = Object.fromEntries(STAGES.map(stage => [stage.status, leads.filter(chat => chat.status === stage.status).length]));
  const inFunnel = leads.length;

  const waiting = leads
    .filter(chat => chat.waiting_since && chat.status !== 'finalizada')
    .sort((a, b) => new Date(a.waiting_since!).getTime() - new Date(b.waiting_since!).getTime())
    .slice(0, 8);

  const openChat = (chatId: string) => {
    selectChat(chatId);
    navigate('/chats');
  };

  return (
    <div className="page space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Painel</h1>
          <p className="page-lead">
            {inFunnel} {inFunnel === 1 ? 'conversa' : 'conversas'} no funil agora, de {chats.length} no total.
          </p>
        </div>
        <Link to="/chats" className="btn btn-secondary">Abrir conversas</Link>
      </header>

      <section aria-labelledby="funnel-title">
        <h2 id="funnel-title" className="sr-only">Funil de vendas</h2>
        <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-gray-700 bg-gray-700 lg:grid-cols-5">
          {STAGES.map((stage) => {
            const count = counts[stage.status] || 0;
            const share = inFunnel ? count / inFunnel : 0;
            const signal = stage.status === 'interesse em compra';
            return (
              <li
                key={stage.status}
                className={`relative bg-gray-800 p-5 ${signal ? 'shadow-[inset_0_2px_0_var(--color-signal)]' : ''}`}
              >
                <p className={`text-sm ${signal ? 'font-medium text-indigo-300' : 'text-gray-300'}`}>{stage.label}</p>
                <p className="mt-3 text-4xl font-semibold tabular-nums text-gray-50 [font-stretch:112.5%]">{count}</p>
                <p className="mt-1 text-xs text-gray-400">{stage.hint}</p>
                <div className="mt-4 h-1 rounded-full bg-gray-700" aria-hidden="true">
                  <div className={`h-1 rounded-full ${signal ? 'bg-indigo-500' : 'bg-gray-400'}`} style={{ width: `${share * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className={`grid gap-6 ${isManager ? 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]' : ''}`}>
        <section className="panel" aria-labelledby="waiting-title">
          <div className="flex items-baseline justify-between border-b border-gray-700 px-5 py-4">
            <h2 id="waiting-title" className="font-semibold text-gray-50">Aguardando resposta</h2>
            <span className="text-xs text-gray-400">Mais antigos primeiro</span>
          </div>
          {waiting.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400">Ninguém esperando. Novas mensagens de clientes aparecem aqui.</p>
          ) : (
            <ul className="divide-y divide-gray-700">
              {waiting.map(chat => (
                <li key={chat.id}>
                  <button
                    type="button"
                    onClick={() => openChat(chat.id)}
                    className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-gray-700/40"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-700 text-sm font-semibold text-gray-100">
                      {chat.client_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-50">{chat.client_name}</p>
                      <p className="truncate text-xs text-gray-400">{STAGES.find(stage => stage.status === chat.status)?.label}</p>
                    </div>
                    <span className={`shrink-0 text-sm tabular-nums ${now - new Date(chat.waiting_since!).getTime() >= LONG_WAIT_MS ? 'font-medium text-indigo-300' : 'text-gray-400'}`}>
                      {waitingLabel(chat.waiting_since!, now)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {isManager && (
          <section className="panel" aria-labelledby="activity-title">
            <div className="border-b border-gray-700 px-5 py-4">
              <h2 id="activity-title" className="font-semibold text-gray-50">Atividade recente</h2>
            </div>
            {logs.length === 0 ? (
              <p className="px-5 py-8 text-sm text-gray-400">As ações da equipe e do sistema aparecem aqui.</p>
            ) : (
              <ul className="max-h-96 space-y-3 overflow-y-auto px-5 py-4">
                {logs.slice(0, 12).map((log, index) => (
                  <li key={index} className="flex gap-3 text-sm">
                    <time className="w-12 shrink-0 text-gray-500" dateTime={new Date(log.timestamp).toISOString()}>
                      {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </time>
                    <span className="text-gray-300">{log.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
