import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { isAxiosError } from 'axios';
import { useAppStore } from '../stores/appStore';
import api from '../services/api';
import type { Chat } from '../types';
import { kanbanLeads } from '../utils/kanbanLeads';

interface Column { id: string; name: string; fixed: boolean }
interface Placement { chat_id: string; column_id: string }
interface Board { columns: Column[]; placements: Placement[] }
const colors: Record<string, string> = {
  iniciada: 'bg-blue-500', 'interesse em compra': 'bg-amber-500', finalizada: 'bg-green-500'
};
const message = (error: unknown) => isAxiosError(error) ? error.response?.data?.error || 'Não foi possível atualizar o Kanban.' : 'Não foi possível atualizar o Kanban.';

export default function Kanban() {
  const { chats, users, fetchChats, fetchUsers, updateChat } = useAppStore();
  const [board, setBoard] = useState<Board>({ columns: [], placements: [] });
  const [tag, setTag] = useState('');
  const [sellerFilter, setSellerFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const routingSignature = chats.map(chat => `${chat.id}:${chat.status}:${chat.assigned_to}`).join('|');
  const loadBoard = useCallback(async () => {
    const response = await api.get<Board>('/kanban');
    setBoard(response.data);
  }, []);
  useEffect(() => {
    Promise.all([fetchChats(), fetchUsers()]).catch(error => setError(message(error)));
  }, [fetchChats, fetchUsers]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- busca assincrona: o estado so muda depois do await
  useEffect(() => { loadBoard().catch(error => setError(message(error))); }, [loadBoard, routingSignature]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  async function createColumn(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api.post('/kanban/columns', { name }); setName(''); await loadBoard(); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  async function renameColumn(column: Column) {
    const name = window.prompt('Novo nome da sua coluna:', column.name);
    if (name === null) return;
    setBusy(true); setError('');
    try { await api.patch(`/kanban/columns/${encodeURIComponent(column.id)}`, { name }); await loadBoard(); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  async function deleteColumn(column: Column) {
    if (!window.confirm(`Excluir a sua coluna “${column.name}”? Os clientes voltarão às suas etapas principais; nenhuma conversa será excluída.`)) return;
    setBusy(true); setError('');
    try { await api.delete(`/kanban/columns/${encodeURIComponent(column.id)}`); await loadBoard(); }
    catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  async function handleDragEnd(result: DropResult) {
    if (!result.destination || result.destination.droppableId === result.source.droppableId || busy) return;
    setBusy(true); setError('');
    try {
      const response = await api.put<{ chat?: Chat }>(`/kanban/cards/${encodeURIComponent(result.draggableId)}`, { column_id: result.destination.droppableId });
      if (response.data.chat) updateChat(response.data.chat);
      await loadBoard();
    } catch (error) { setError(message(error)); }
    finally { setBusy(false); }
  }
  const placements = new Map(board.placements.map(placement => [placement.chat_id, placement.column_id]));
  const leads = kanbanLeads(chats);
  return <div className="h-full min-h-0 flex flex-col p-4 md:p-6 gap-4">
    <header className="shrink-0 space-y-3">
      <h1 className="text-2xl font-bold">Meu Kanban</h1>
      <p className="text-sm text-gray-400">As três etapas fixas são protegidas. Suas colunas extras organizam somente a sua visão.</p>
      <p className="text-sm text-amber-200">Em Interesse em Compra: rodízio entre vendedores online após 1 minuto sem resposta humana. Mover para uma coluna pessoal não pausa esse prazo.</p>
      <div className="flex flex-wrap gap-2">
        <input aria-label="Filtrar por etiqueta" placeholder="Etiqueta" value={tag} onChange={event => setTag(event.target.value)} className="bg-gray-700 p-2 rounded" />
        <select aria-label="Filtrar por vendedor" value={sellerFilter} onChange={event => setSellerFilter(event.target.value)} className="bg-gray-700 p-2 rounded"><option value="">Todos vendedores</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
        <input aria-label="Criado a partir de" type="date" value={from} onChange={event => setFrom(event.target.value)} className="bg-gray-700 p-2 rounded" />
        <input aria-label="Criado ate" type="date" value={to} onChange={event => setTo(event.target.value)} className="bg-gray-700 p-2 rounded" />
      </div>
      <form onSubmit={createColumn} className="flex flex-wrap gap-2">
        <input aria-label="Nome da nova coluna" className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white max-w-full" placeholder="Ex.: Visita agendada" value={name} onChange={event => setName(event.target.value)} maxLength={60} required />
        <button className="bg-indigo-600 rounded-lg px-4 py-2 disabled:opacity-50" disabled={busy}>Criar minha coluna</button>
      </form>
      {error && <p role="alert" className="text-red-300">{error}</p>}
    </header>
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex flex-1 min-h-0 gap-4 overflow-x-auto pb-3" aria-label="Colunas do Kanban">
        {board.columns.map(column => {
          const cards = leads.filter(chat => (!tag || chat.tags.some(t => t.toLowerCase().includes(tag.toLowerCase()))) && (!sellerFilter || chat.assigned_to === sellerFilter) && (!from || new Date(chat.created_at) >= new Date(from + 'T00:00:00')) && (!to || new Date(chat.created_at) <= new Date(to + 'T23:59:59')) && (placements.get(chat.id) || ((chat.status as string) === 'em atendimento' ? 'interesse em compra' : chat.status)) === column.id);
          return <section key={column.id} className="w-80 min-w-72 shrink-0 flex flex-col min-h-0 bg-gray-800 border border-gray-700 rounded-xl p-3">
            <header className="shrink-0 pb-3 space-y-2">
              <div className="flex gap-2 items-center">
                <span className={`w-2 h-2 rounded-full shrink-0 ${colors[column.id] || 'bg-violet-500'}`} />
                <h2 className="font-bold flex-1 break-words">{column.name}</h2>
                <span className="text-xs bg-gray-700 rounded-full px-2 py-1">{cards.length}</span>
              </div>
              {column.fixed ? <p className="text-xs text-gray-400">Coluna fixa · protegida</p> : <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-400 mr-auto">Pessoal</span>
                <button onClick={() => void renameColumn(column)} disabled={busy} className="text-indigo-300">Renomear</button>
                <button onClick={() => void deleteColumn(column)} disabled={busy} className="text-red-300">Excluir</button>
              </div>}
            </header>
            <Droppable droppableId={column.id}>
              {provided => <div ref={provided.innerRef} {...provided.droppableProps} className="flex-1 min-h-24 overflow-y-auto space-y-3 pr-1">
                {cards.map((chat, index) => {
                  const seconds = chat.sales_reply_due_at ? Math.max(0, Math.ceil((Date.parse(chat.sales_reply_due_at) - now) / 1000)) : null;
                  const seller = users.find(user => user.id === chat.assigned_to);
                  return <Draggable key={chat.id} draggableId={chat.id} index={index} isDragDisabled={busy}>
                    {provided => <article ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className="bg-gray-700 border border-gray-600 rounded-lg p-3 hover:border-indigo-500">
                      <p className="font-medium text-white text-sm truncate">{chat.client_name}</p>
                      <p className="text-xs text-gray-400">+{chat.client_phone.slice(-4)}</p>
                      <p className="text-xs text-gray-300 mt-2">Responsável: {seller?.name || 'Aguardando vendedor online'}</p>
                      {seconds !== null && <p className="text-xs text-amber-300 mt-1">{seconds > 0 ? `Responder em ${seconds}s` : 'Verificando próximo vendedor…'}</p>}
                      {seconds === null && chat.status === 'interesse em compra' && chat.assigned_to && <p className="text-xs text-emerald-300 mt-1">Atendimento assumido · rodízio pausado</p>}
                      {!!chat.tags.length && <div className="flex flex-wrap gap-1 mt-2">{chat.tags.slice(0, 3).map(tag => <span key={tag} className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-xs">{tag}</span>)}</div>}
                    </article>}
                  </Draggable>;
                })}
                {provided.placeholder}
              </div>}
            </Droppable>
          </section>;
        })}
        {!board.columns.length && <p className="text-gray-400">Carregando seu Kanban…</p>}
      </div>
    </DragDropContext>
  </div>;
}
