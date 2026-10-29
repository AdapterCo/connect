import { useCallback, useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import api from '../services/api';

interface RankedSeller { id: string; name: string; points: number; position: number; me: boolean }
interface OfferedLead { id: string | null; client_name: string | null; seller_id: string | null; seller_name: string | null; due_at: string; mine: boolean }
interface QueuedLead { id: string | null; client_name: string | null; queued_at: string; position: number }
interface QueueData { ranking: RankedSeller[]; offered: OfferedLead[]; queue: QueuedLead[] }

const REFRESH_MS = 10_000;

const points = (count: number) => (count === 1 ? '1 ponto' : `${count} pontos`);

function secondsLeft(due: string, now: number) {
  return Math.max(0, Math.ceil((new Date(due).getTime() - now) / 1000));
}

function waited(since: string, now: number) {
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  return `há ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// Fila de leads (um oferecido por vez) e ranking de aceites do mes.
// `changes` muda quando chega uma atualizacao de conversa, para recarregar na hora.
export default function LeadQueuePanel({ changes, onOpenChat }: { changes: unknown; onOpenChat: (chatId: string) => void }) {
  const [data, setData] = useState<QueueData | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const debounce = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const res = await api.get<QueueData>('/commercial/lead-queue');
      setData(res.data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    const refresh = window.setInterval(load, REFRESH_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(refresh); window.clearInterval(tick); };
  }, [load]);

  // Carrega na abertura e recarrega logo apos cada mudanca nas conversas.
  useEffect(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(load, data ? 600 : 0);
    return () => window.clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `data` so define o atraso inicial
  }, [changes, load]);

  const leader = data?.ranking[0]?.points || 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="panel" aria-labelledby="queue-title">
        <div className="flex items-baseline justify-between border-b border-gray-700 px-5 py-4">
          <h2 id="queue-title" className="font-semibold text-gray-50">Fila de leads</h2>
          {data && <span className="text-xs text-gray-400">{data.queue.length} aguardando na fila</span>}
        </div>

        {!data ? (
          <p className="px-5 py-8 text-sm text-gray-400">{failed ? 'Não foi possível carregar a fila agora.' : 'Carregando…'}</p>
        ) : (
          <div>
            <p className="px-5 pt-4 text-xs font-medium uppercase tracking-wide text-gray-500">Aguardando aceite</p>
            {data.offered.length === 0 ? (
              <p className="px-5 pb-4 pt-2 text-sm text-gray-400">Nenhum lead aguardando aceite agora.</p>
            ) : (
              <ul className="divide-y divide-gray-700">
                {data.offered.map((lead, index) => {
                  const left = secondsLeft(lead.due_at, now);
                  const owner = lead.mine ? 'Oferecido para você' : lead.seller_name ? `Oferecido para ${lead.seller_name}` : 'Sem vendedor online';
                  const content = (
                    <>
                      <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-500 opacity-60" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-indigo-500" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-50">{lead.client_name || 'Lead novo'}</span>
                        <span className={`block truncate text-xs ${lead.mine ? 'font-medium text-indigo-300' : 'text-gray-400'}`}>{owner}</span>
                      </span>
                      <span className={`shrink-0 text-sm tabular-nums ${left <= 15 ? 'font-medium text-indigo-300' : 'text-gray-400'}`}>
                        {left > 0 ? `0:${String(left).padStart(2, '0')}` : 'trocando…'}
                      </span>
                    </>
                  );
                  return (
                    <li key={lead.id || `offered-${index}`}>
                      {lead.id ? (
                        <button type="button" onClick={() => onOpenChat(lead.id!)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-gray-700/40">
                          {content}
                        </button>
                      ) : (
                        <div className="flex items-center gap-4 px-5 py-3">{content}</div>
                      )}
                      {lead.mine && (
                        <p className="px-5 pb-3 text-xs text-gray-300">
                          Responda <strong>ACEITAR</strong> no WhatsApp para receber os dados do cliente e somar 1 ponto.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="border-t border-gray-700 px-5 pt-4 text-xs font-medium uppercase tracking-wide text-gray-500">Próximos da fila</p>
            {data.queue.length === 0 ? (
              <p className="px-5 pb-5 pt-2 text-sm text-gray-400">Fila vazia. Leads novos entram aqui quando outro já está aguardando aceite.</p>
            ) : (
              <ol className="max-h-72 divide-y divide-gray-700 overflow-y-auto">
                {data.queue.map(lead => {
                  const content = (
                    <>
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-semibold tabular-nums text-gray-100">
                        {lead.position}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-gray-50">{lead.client_name || `Lead ${lead.position}`}</span>
                      <span className="shrink-0 text-xs text-gray-400">{waited(lead.queued_at, now)}</span>
                    </>
                  );
                  return (
                    <li key={lead.id || `queued-${lead.position}`}>
                      {lead.id ? (
                        <button type="button" onClick={() => onOpenChat(lead.id!)} className="flex w-full items-center gap-4 px-5 py-2.5 text-left hover:bg-gray-700/40">
                          {content}
                        </button>
                      ) : (
                        <div className="flex items-center gap-4 px-5 py-2.5">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="ranking-title">
        <div className="flex items-baseline justify-between border-b border-gray-700 px-5 py-4">
          <h2 id="ranking-title" className="flex items-center gap-2 font-semibold text-gray-50">
            <Trophy className="h-4 w-4 text-indigo-300" strokeWidth={2} aria-hidden="true" />
            Ranking do mês
          </h2>
          <span className="text-xs text-gray-400">1 ponto por lead aceito</span>
        </div>
        {!data ? (
          <p className="px-5 py-8 text-sm text-gray-400">{failed ? 'Não foi possível carregar o ranking agora.' : 'Carregando…'}</p>
        ) : data.ranking.length === 0 ? (
          <p className="px-5 py-8 text-sm text-gray-400">Cadastre vendedores na equipe para montar o ranking.</p>
        ) : (
          <ol className="max-h-96 space-y-1 overflow-y-auto px-3 py-3">
            {data.ranking.map(seller => (
              <li
                key={seller.id}
                className={`flex items-center gap-3 rounded-md px-2 py-2 ${seller.me ? 'bg-indigo-950 ring-1 ring-indigo-800' : ''}`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
                    seller.position === 1 && seller.points > 0 ? 'bg-indigo-500 text-ink' : 'bg-gray-700 text-gray-100'
                  }`}
                  aria-label={`${seller.position}º lugar`}
                >
                  {seller.position}º
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium text-gray-50">
                      {seller.name}{seller.me && <span className="ml-1 text-xs font-normal text-indigo-300">(você)</span>}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-gray-300">{points(seller.points)}</span>
                  </span>
                  <span className="mt-1.5 block h-1 rounded-full bg-gray-700" aria-hidden="true">
                    <span
                      className={`block h-1 rounded-full ${seller.position === 1 ? 'bg-indigo-500' : 'bg-gray-400'}`}
                      style={{ width: `${leader ? (seller.points / leader) * 100 : 0}%` }}
                    />
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
