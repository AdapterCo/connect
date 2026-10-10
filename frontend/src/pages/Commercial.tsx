import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiErrorMessage } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useAppStore } from '../stores/appStore';

interface Lead { id: string; client_name: string; phone: string; seller_id: string | null; status: string; product: string | null; variant: string | null; payment: string | null; lost_reason: string | null }
interface Task { id: string; title: string; due_at: string; completed_at: string | null; opportunity: { client_name: string } }
interface Reply { id: string; title: string; text: string }
interface AfterSale { id: string; type: string; status: string; description: string; resolution: string | null }
interface Sale { id: string; created_at: string; total?: string; status: string; cost?: string | null; margin?: number | null; received?: number; balance?: number; refund_due?: number; commission?: number; commission_earned?: number;
  product: { name: string; serial: string }; opportunity: { client_name: string; phone: string } | null;
  receipts?: { id: string; amount: string; kind: string; method: string; reference: string | null; created_at: string }[]; after_sales: AfterSale[] }
const field = 'bg-gray-700 border border-gray-600 rounded px-3 py-2 w-full';
const button = 'bg-indigo-600 rounded px-3 py-2 disabled:opacity-50';
const section = 'bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4';
const currency = (value: string | number | undefined) => Number(value ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const displayDate = (value: string) => new Date(value).toLocaleString('pt-BR');
const statusNames: Record<string, string> = { open: 'Aberto', won: 'Com venda', lost: 'Perdido', sold: 'Vendido', returned: 'Devolvido', resolved: 'Resolvido' };
const afterTypes: Record<string, string> = { warranty: 'Garantia', return: 'Devolução', support: 'Suporte' };
const methods: Record<string, string> = { pix: 'Pix', cash: 'Dinheiro', card: 'Cartão', boleto: 'Boleto' };
const initialLead = { product: '', variant: '', payment: '', status: 'open', lost_reason: '', seller_id: '' };

export default function Commercial() {
  const user = useAuthStore(state => state.user);
  const manager = ['admin', 'supervisor'].includes(user?.role || '');
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]), [tasks, setTasks] = useState<Task[]>([]), [sales, setSales] = useState<Sale[]>([]), [replies, setReplies] = useState<Reply[]>([]);
  const [sellers, setSellers] = useState<{ id: string; name: string }[]>([]);
  const [summary, setSummary] = useState({ total: 0, open: 0, lost: 0, converted: 0, conversion_rate: 0 });
  const [tab, setTab] = useState('leads'), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [leadId, setLeadId] = useState(''), [leadDraft, setLeadDraft] = useState(initialLead);
  const [newName, setNewName] = useState(''), [newPhone, setNewPhone] = useState('');
  const [filter, setFilter] = useState(''), [leadStatus, setLeadStatus] = useState('');
  const [taskLead, setTaskLead] = useState(''), [taskTitle, setTaskTitle] = useState(''), [taskDue, setTaskDue] = useState('');
  const [replyId, setReplyId] = useState(''), [replyTitle, setReplyTitle] = useState(''), [replyText, setReplyText] = useState('');
  const [saleId, setSaleId] = useState(''), [receiptAmount, setReceiptAmount] = useState(''), [receiptKind, setReceiptKind] = useState('payment'), [receiptMethod, setReceiptMethod] = useState('pix'), [reference, setReference] = useState('');
  const [receiptRequest, setReceiptRequest] = useState(() => crypto.randomUUID());
  const [afterType, setAfterType] = useState('warranty'), [description, setDescription] = useState(''), [afterId, setAfterId] = useState(''), [resolution, setResolution] = useState(''), [approveReturn, setApproveReturn] = useState(false);
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const load = useCallback(async () => {
    const [a, b, c, d, e] = await Promise.all([api.get<Lead[]>('/commercial/leads'), api.get<Task[]>('/commercial/tasks'),
      api.get<Sale[]>(manager ? '/commercial/sales' : '/commercial/sales/operations', { params: { from: from || undefined, to: to || undefined } }), api.get<Reply[]>('/commercial/replies'), api.get<{ id: string; name: string }[]>('/products/sellers')]);
    setLeads(a.data); setTasks(b.data); setSales(c.data); setReplies(d.data); setSellers(e.data);
    if (manager) { const totals = await api.get('/commercial/summary'); setSummary(totals.data); }
  }, [from, to, manager]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load updates state only after the HTTP requests resolve.
  useEffect(() => { let active = true; load().catch(error => { if (active) setMessage(apiErrorMessage(error, 'Erro ao carregar Gestão Comercial.')); }); return () => { active = false; }; }, [load]);
  async function run(work: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage('');
    try { await work(); setMessage(success); await load(); }
    catch (error) { setMessage(apiErrorMessage(error, 'Não foi possível concluir.')); }
    finally { setBusy(false); }
  }
  function chooseLead(lead: Lead) {
    setLeadId(lead.id); setLeadDraft({ product: lead.product || '', variant: lead.variant || '', payment: lead.payment || '', status: lead.status === 'won' ? 'open' : lead.status, lost_reason: lead.lost_reason || '', seller_id: lead.seller_id || '' });
    setTaskLead(lead.id);
  }
  const chosenSale = sales.find(sale => sale.id === saleId);
  const pendingTasks = tasks.filter(task => !task.completed_at);
  const activeSales = sales.filter(sale => sale.status === 'sold');
  const sum = (key: 'balance' | 'received' | 'commission_earned') => sales.reduce((total, sale) => total + (sale[key] ?? 0), 0);
  async function openChats(id: string) {
    const { data } = await api.get<{ id: string; status: string; instance: { name: string } }[]>(`/commercial/leads/${id}/chats`);
    if (!data.length) { setMessage('Não há conversa acessível deste lead na sua conexão. Use o telefone para iniciar contato.'); return; }
    useAppStore.getState().selectChat(data[0].id); navigate('/chats');
  }
  const submit = (event: FormEvent, work: () => Promise<unknown>, success: string) => { event.preventDefault(); void run(work, success); };
  return <div className="h-full overflow-y-auto p-6 space-y-6 text-gray-50">
    <header className="flex flex-wrap items-center gap-4"><div className="mr-auto"><h1 className="text-2xl font-bold">Gestão Comercial</h1><p className="text-gray-400">Leads, vendas e continuidade do atendimento.</p></div><button className={button} disabled={busy} onClick={() => void run(load, 'Dados atualizados.')}>Atualizar</button></header>
    <nav aria-label="Áreas comerciais" className="flex flex-wrap gap-2">{[['leads', 'Leads'], ['tasks', `Retornos (${pendingTasks.length})`], ['sales', 'Recebíveis e comissões'], ['after', 'Pós-venda'], ['replies', 'Respostas compartilhadas']].filter(([id]) => manager || id !== 'sales').map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 rounded ${tab === id ? 'bg-indigo-600' : 'bg-gray-800'}`}>{label}</button>)}</nav>
    {message && <p role="status" className="bg-gray-800 rounded p-3 text-indigo-200">{message}</p>}
    {tab === 'leads' && <>
      {manager && <><div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{[['Leads cadastrados', String(summary.total)], ['Abertos', String(summary.open)], ['Com venda vinculada', String(summary.converted)], ['Conversão por lead', `${summary.conversion_rate}%`]].map(([label, value]) => <div key={label} className="bg-gray-800 rounded p-4"><p className="text-gray-400">{label}</p><p className="text-2xl font-bold">{value}</p></div>)}</div><p className="text-sm text-gray-400">Conversão considera todos os leads acessíveis com pelo menos uma venda vinculada e não devolvida. Não depende de finalizar conversas.</p></>}
      <section className={section}><h2 className="text-lg font-semibold">Cadastrar lead</h2><form className="grid md:grid-cols-3 gap-3" onSubmit={event => submit(event, async () => { await api.post('/commercial/leads', { client_name: newName, phone: newPhone }); setNewName(''); setNewPhone(''); }, 'Lead cadastrado.')}>
        <label>Cliente<input className={field} value={newName} onChange={e => setNewName(e.target.value)} maxLength={160} required /></label><label>Telefone com DDI<input className={field} value={newPhone} onChange={e => setNewPhone(e.target.value)} maxLength={20} placeholder="5521999999999" required /></label><button className={button} disabled={busy}>Cadastrar</button></form></section>
      <section className={section}><h2 className="text-lg font-semibold">Leads recentes</h2><p className="text-sm text-gray-400">Até 200 registros recentes. Um lead pode estar ligado a conversas de números distintos; o histórico continua isolado.</p>
        <div className="flex gap-3"><input aria-label="Buscar lead" placeholder="Cliente, telefone ou aparelho" className={field} value={filter} onChange={e => setFilter(e.target.value)} /><select aria-label="Filtrar situação" className={field} value={leadStatus} onChange={e => setLeadStatus(e.target.value)}><option value="">Todas as situações</option>{['open', 'won', 'lost'].map(status => <option key={status} value={status}>{statusNames[status]}</option>)}</select></div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{leads.filter(lead => (!leadStatus || lead.status === leadStatus) && `${lead.client_name} ${lead.phone} ${lead.product}`.toLowerCase().includes(filter.toLowerCase())).map(lead => <article key={lead.id} className="border border-gray-700 rounded p-3 space-y-2">
          <p className="font-semibold">{lead.client_name} · {statusNames[lead.status]}</p><p className="text-gray-400">+{lead.phone}</p><p>{lead.product || 'Aparelho não escolhido'} · {lead.variant || 'Variação não informada'} · {lead.payment || 'Pagamento não escolhido'}</p>
          <p className="text-sm text-gray-400">Responsável: {sellers.find(seller => seller.id === lead.seller_id)?.name || 'Não atribuído'}</p>{lead.lost_reason && <p className="text-amber-300">Motivo: {lead.lost_reason}</p>}
          <div className="flex flex-wrap gap-3 text-indigo-300"><button onClick={() => chooseLead(lead)}>Editar / qualificar</button><button disabled={busy} onClick={() => { setBusy(true); openChats(lead.id).catch(error => setMessage(apiErrorMessage(error, 'Conversa indisponível.'))).finally(() => setBusy(false)); }}>Abrir conversa</button><a href={`https://wa.me/${lead.phone}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></div>
        </article>)}</div>{!leads.length && <p className="text-gray-400">Nenhum lead disponível.</p>}
      </section>
      {leadId && <section className={section}><h2 className="text-lg font-semibold">Qualificação: {leads.find(lead => lead.id === leadId)?.client_name}</h2><form className="grid md:grid-cols-2 gap-3" onSubmit={event => submit(event, () => api.patch(`/commercial/leads/${leadId}`, { ...leadDraft, ...(!manager ? { seller_id: undefined } : { seller_id: leadDraft.seller_id || undefined }) }), 'Qualificação atualizada.')}>
        <label>Aparelho escolhido<input className={field} value={leadDraft.product} maxLength={160} onChange={e => setLeadDraft({ ...leadDraft, product: e.target.value })} /></label><label>Variação / memória / cor<input className={field} value={leadDraft.variant} maxLength={160} onChange={e => setLeadDraft({ ...leadDraft, variant: e.target.value })} /></label>
        <label>Pagamento<select className={field} value={leadDraft.payment} onChange={e => setLeadDraft({ ...leadDraft, payment: e.target.value })}><option value="">Não escolhido</option>{['Pix', 'Dinheiro', 'Cartao', 'Boleto'].map(value => <option key={value} value={value}>{value === 'Cartao' ? 'Cartão' : value}</option>)}</select></label>
        <label>Situação<select className={field} value={leadDraft.status} onChange={e => setLeadDraft({ ...leadDraft, status: e.target.value })}><option value="open">Aberto / reabrir</option><option value="lost">Perdido</option></select></label>
        {manager && <label>Responsável<select className={field} value={leadDraft.seller_id} onChange={e => setLeadDraft({ ...leadDraft, seller_id: e.target.value })}><option value="">Manter responsável</option>{sellers.map(seller => <option key={seller.id} value={seller.id}>{seller.name}</option>)}</select></label>}
        {leadDraft.status === 'lost' && <label>Motivo da perda<input className={field} value={leadDraft.lost_reason} maxLength={500} required onChange={e => setLeadDraft({ ...leadDraft, lost_reason: e.target.value })} /></label>}
        <button className={button} disabled={busy}>Salvar qualificação</button><button type="button" onClick={() => { setTaskLead(leadId); setTab('tasks'); }}>Agendar retorno</button>
      </form><p className="text-sm text-gray-400">Vendas são registradas na tela Vendas. Alterar os dados comerciais não libera acesso às mensagens da loja.</p></section>}
    </>}
    {tab === 'tasks' && <>
      <section className={section}><h2 className="text-lg font-semibold">Agendar retorno</h2><form className="grid md:grid-cols-3 gap-3" onSubmit={event => submit(event, async () => { await api.post('/commercial/tasks', { opportunity_id: taskLead, title: taskTitle, due_at: new Date(taskDue).toISOString() }); setTaskTitle(''); setTaskDue(''); }, 'Retorno agendado.')}>
        <label>Lead<select className={field} value={taskLead} required onChange={e => setTaskLead(e.target.value)}><option value="">Selecione</option>{leads.filter(lead => lead.status === 'open').map(lead => <option key={lead.id} value={lead.id}>{lead.client_name} · {lead.product}</option>)}</select></label>
        <label>Tarefa<input className={field} value={taskTitle} onChange={e => setTaskTitle(e.target.value)} required maxLength={160} placeholder="Confirmar disponibilidade e retornar" /></label><label>Data e hora<input className={field} type="datetime-local" value={taskDue} required onChange={e => setTaskDue(e.target.value)} /></label><button className={button} disabled={busy}>Agendar</button>
      </form></section><section className={section}><h2 className="text-lg font-semibold">Tarefas recentes</h2>{tasks.map(task => <article key={task.id} className="border-b border-gray-700 pb-3 flex flex-wrap gap-3 items-center"><div className="mr-auto"><p>{task.opportunity.client_name}: {task.title}</p><p className={!task.completed_at && Date.parse(task.due_at) < now ? 'text-amber-300' : 'text-gray-400'}>{displayDate(task.due_at)} · {task.completed_at ? 'Concluída' : 'Pendente'}</p></div>{!task.completed_at && <button className={button} disabled={busy} onClick={() => void run(() => api.patch(`/commercial/tasks/${task.id}/complete`), 'Tarefa concluída.')}>Concluir</button>}</article>)}{!tasks.length && <p>Nenhuma tarefa registrada.</p>}</section>
    </>}
    {(tab === 'after' || (manager && tab === 'sales')) && <section className={section}><h2 className="text-lg font-semibold">Vendas registradas</h2>{manager && <><div className="flex flex-wrap gap-3"><label>Desde<input className={field} type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label>Até<input className={field} type="date" value={to} onChange={e => setTo(e.target.value)} /></label></div>
      <p className="text-sm text-gray-400">Valores dos até 200 registros exibidos no período. Recebimentos são lançamentos manuais, não confirmação bancária automática. Custos desconhecidos não geram margem estimada.</p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">{[['Vendas ativas', String(activeSales.length)], ['Recebido líquido', currency(sum('received'))], ['A receber', currency(sum('balance'))], ['Comissão por recebimento', currency(sum('commission_earned'))]].map(([label, value]) => <div key={label} className="bg-gray-700 rounded p-3"><p className="text-gray-300">{label}</p><p className="text-xl font-bold">{value}</p></div>)}</div></>}
      <select aria-label="Selecionar venda" className={field} value={saleId} onChange={e => { setSaleId(e.target.value); setAfterId(''); setReceiptRequest(crypto.randomUUID()); }}><option value="">Selecione uma venda</option>{sales.map(sale => <option key={sale.id} value={sale.id}>{sale.product.name} · {sale.opportunity?.client_name || 'Sem lead vinculado'} · {manager ? currency(sale.total) : ''} · {statusNames[sale.status]}</option>)}</select>
      {chosenSale && <div className="space-y-3"><p>IMEI: {chosenSale.product.serial} · Cliente: {chosenSale.opportunity?.client_name || 'Não vinculado'} · {statusNames[chosenSale.status]}</p>{manager && <><p>Total: {currency(chosenSale.total)} · Recebido líquido: {currency(chosenSale.received)} · Saldo: {currency(chosenSale.balance)} · Devolução a reembolsar: {currency(chosenSale.refund_due)}</p><p>Comissão contratada: {currency(chosenSale.commission)} · Proporcional ao recebido: {currency(chosenSale.commission_earned)}{manager && ` · Margem após comissão: ${chosenSale.margin == null ? 'Custo não informado' : currency(chosenSale.margin)}`}</p></>}</div>}
    </section>}
    {manager && tab === 'sales' && chosenSale && <>
      {manager && <section className={section}><h2 className="text-lg font-semibold">Registrar recebimento ou estorno</h2><form className="grid md:grid-cols-2 gap-3" onSubmit={event => submit(event, async () => { await api.post(`/commercial/sales/${saleId}/receipts`, { amount: receiptAmount, kind: receiptKind, method: receiptMethod, reference, request_id: receiptRequest }); setReceiptRequest(crypto.randomUUID()); setReceiptAmount(''); setReference(''); }, 'Lançamento registrado.')}>
        <label>Tipo<select className={field} value={receiptKind} onChange={e => { setReceiptKind(e.target.value); setReceiptRequest(crypto.randomUUID()); }}><option value="payment">Recebimento</option><option value="refund">Estorno</option></select></label><label>Valor<input className={field} type="number" min="0.01" step="0.01" value={receiptAmount} required onChange={e => { setReceiptAmount(e.target.value); setReceiptRequest(crypto.randomUUID()); }} /></label><label>Forma<select className={field} value={receiptMethod} onChange={e => { setReceiptMethod(e.target.value); setReceiptRequest(crypto.randomUUID()); }}>{Object.entries(methods).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>Referência<input className={field} value={reference} maxLength={160} onChange={e => { setReference(e.target.value); setReceiptRequest(crypto.randomUUID()); }} /></label><button className={button} disabled={busy}>Registrar lançamento</button>
      </form><p className="text-sm text-gray-400">Confirme o valor efetivamente recebido antes de lançar. Entrada cadastrada no produto não é registrada automaticamente como recebimento.</p></section>}
      <section className={section}><h2 className="text-lg font-semibold">Histórico financeiro</h2>{chosenSale.receipts?.map(receipt => <p key={receipt.id}>{displayDate(receipt.created_at)} · {receipt.kind === 'refund' ? 'Estorno' : 'Recebimento'} · {currency(receipt.amount)} · {methods[receipt.method]} · {receipt.reference || 'Sem referência'}</p>)}{!chosenSale.receipts?.length && <p>Nenhum recebimento registrado.</p>}<p className="text-sm text-gray-400">Comissões são calculadas, sem pagamento automático ao vendedor. Devoluções deixam de gerar comissão.</p></section>
    </>}
    {tab === 'after' && chosenSale && <>
      <section className={section}><h2 className="text-lg font-semibold">Abrir solicitação de pós-venda</h2><form className="space-y-3" onSubmit={event => submit(event, async () => { await api.post(`/commercial/sales/${saleId}/after-sales`, { type: afterType, description }); setDescription(''); }, 'Solicitação registrada.')}>
        <label>Tipo<select className={field} value={afterType} onChange={e => setAfterType(e.target.value)}>{Object.entries(afterTypes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label className="block">Descrição<textarea className={field} rows={3} value={description} maxLength={2000} required onChange={e => setDescription(e.target.value)} /></label><button className={button} disabled={busy}>Abrir solicitação</button>
      </form></section><section className={section}><h2 className="text-lg font-semibold">Solicitações</h2>{chosenSale.after_sales.map(item => <article key={item.id} className="border-b border-gray-700 pb-3 space-y-2"><p>{afterTypes[item.type]} · {statusNames[item.status]}</p><p className="whitespace-pre-wrap">{item.description}</p>{item.resolution && <p>Resolução: {item.resolution}</p>}{item.status === 'open' && <button onClick={() => { setAfterId(item.id); setResolution(''); setApproveReturn(false); }} className="text-indigo-300">Resolver</button>}</article>)}{!chosenSale.after_sales.length && <p>Nenhuma solicitação registrada.</p>}
      {afterId && <form className="space-y-3" onSubmit={event => submit(event, async () => {
        if (approveReturn && !window.confirm('Aprovar devolução? A venda deixará de gerar comissão e o reembolso será controlado em Recebíveis.')) return;
        await api.patch(`/commercial/after-sales/${afterId}/resolve`, { resolution, approve_return: approveReturn }); setAfterId('');
      }, 'Solicitação resolvida.')}><label className="block">Resolução<textarea className={field} value={resolution} maxLength={2000} required onChange={e => setResolution(e.target.value)} /></label>{manager && chosenSale.after_sales.find(item => item.id === afterId)?.type === 'return' && <label className="block"><input type="checkbox" checked={approveReturn} onChange={e => setApproveReturn(e.target.checked)} /> Aprovar devolução da venda</label>}<button className={button} disabled={busy}>Concluir</button><p className="text-sm text-gray-400">Aprovar devolução não recoloca o aparelho automaticamente em estoque nem executa reembolso bancário.</p></form>}
      </section>
    </>}
    {tab === 'replies' && <>
      {manager && <section className={section}><h2 className="text-lg font-semibold">{replyId ? 'Editar resposta compartilhada' : 'Criar resposta compartilhada'}</h2><form className="space-y-3" onSubmit={event => submit(event, async () => { const body = { title: replyTitle, text: replyText }; if (replyId) await api.put(`/commercial/replies/${replyId}`, body); else await api.post('/commercial/replies', body); setReplyId(''); setReplyTitle(''); setReplyText(''); }, 'Biblioteca atualizada.')}>
        <label>Título<input className={field} value={replyTitle} maxLength={100} required onChange={e => setReplyTitle(e.target.value)} /></label><label className="block">Resposta<textarea className={field} rows={4} value={replyText} required maxLength={4000} onChange={e => setReplyText(e.target.value)} /></label><button className={button} disabled={busy}>Salvar</button><button type="button" className="ml-3" onClick={() => { setReplyId(''); setReplyTitle(''); setReplyText(''); }}>Nova resposta</button>
      </form></section>}<section className={section}><h2 className="text-lg font-semibold">Biblioteca da empresa</h2><p className="text-sm text-gray-400">Disponível no campo de respostas prontas do chat, inclusive pelo atalho `/`.</p>{replies.map(reply => <article key={reply.id} className="border-b border-gray-700 pb-3 space-y-2"><h3 className="font-semibold">{reply.title}</h3><p className="whitespace-pre-wrap">{reply.text}</p>{manager && <div className="flex gap-4"><button className="text-indigo-300" onClick={() => { setReplyId(reply.id); setReplyTitle(reply.title); setReplyText(reply.text); }}>Editar</button><button className="text-red-300" disabled={busy} onClick={() => { if (window.confirm('Remover esta resposta da biblioteca?')) void run(() => api.delete(`/commercial/replies/${reply.id}`), 'Resposta removida.'); }}>Remover resposta</button></div>}</article>)}{!replies.length && <p>Nenhuma resposta compartilhada cadastrada.</p>}</section>
    </>}
  </div>;
}
