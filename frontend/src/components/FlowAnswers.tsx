import { useEffect, useState } from 'react';
import api from '../services/api';
import type { FlowSessionInfo } from '../types';

const STATUS_LABELS: Record<FlowSessionInfo['status'], string> = {
  active: 'Em andamento',
  finished: 'Concluído',
  transferred: 'Transferido para atendente',
  cancelled: 'Interrompido (atendente assumiu)',
  expired: 'Expirado',
  error: 'Interrompido por erro'
};

// Respostas que o fluxo de atendimento captou nesta conversa.
export default function FlowAnswers({ chatId, refreshKey }: { chatId: string; refreshKey: number }) {
  const [session, setSession] = useState<{ chatId: string; data: FlowSessionInfo | null } | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let ignore = false;
    api.get<FlowSessionInfo | null>(`/chats/${chatId}/flow`)
      .then((response) => { if (!ignore) setSession({ chatId, data: response.data }); })
      .catch(() => { if (!ignore) setSession({ chatId, data: null }); });
    return () => { ignore = true; };
  }, [chatId, refreshKey]);

  const info = session?.chatId === chatId ? session.data : null;
  if (!info) return null;
  const answers = Object.entries(info.variables || {});

  return (
    <div className="border-b border-gray-700 bg-gray-800/60 px-4 py-2 text-sm">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <span className="font-medium text-gray-200">Fluxo “{info.flow_name}” · <span className="text-gray-400">{STATUS_LABELS[info.status] || info.status}</span></span>
        <span className="text-gray-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        answers.length ? (
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {answers.map(([name, value]) => (
              <div key={name} className="flex gap-2">
                <dt className="font-mono text-xs text-indigo-300">{name}</dt>
                <dd className="break-words text-gray-200">{String(value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-1 text-gray-400">Nenhuma resposta captada ainda.</p>
        )
      )}
    </div>
  );
}
