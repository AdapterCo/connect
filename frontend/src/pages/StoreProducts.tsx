import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { isAxiosError } from 'axios';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

interface Seller { id: string; name: string }
interface Product {
  cost?: string | null; supplier_name?: string | null; commission_rate?: string;
  reserved_until: string | null; reserved_lead_id: string | null;
  id: string; name: string; seller_id: string | null; seller: Seller | null;
  price: number; down_payment: string; payment_method: string | null;
  serial: string | null; color: string | null; memory: string | null;
  condition: string | null; status: string; sold_at: string | null;
}
interface Metric extends Seller { count: number; total: number; average: number; down_payment: number }
interface Draft {
  cost: string; supplier_name: string; commission_rate: string;
  id: string; name: string; seller_id: string; price: string; down_payment: string;
  payment_method: string; serial: string; color: string; memory: string; condition: string;
}
const empty: Draft = { id: '', name: '', seller_id: '', price: '', down_payment: '0', payment_method: 'pix', serial: '', color: '', memory: '', condition: 'new', cost: '', supplier_name: '', commission_rate: '0' };
const payments: Record<string, string> = { cash: 'Dinheiro', pix: 'Pix', card: 'Cartão', boleto: 'Boleto' };
const conditions: Record<string, string> = { new: 'Novo', used: 'Usado', refurbished: 'Recondicionado' };
const money = (value: number | string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const errorMessage = (error: unknown) => isAxiosError(error) ? error.response?.data?.error || 'Não foi possível concluir a operação.' : 'Erro inesperado.';
const fieldClass = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white disabled:opacity-60';

export default function StoreProducts() {
  const pageRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore(state => state.user);
  const manager = user?.role === 'admin' || user?.role === 'supervisor';
  const allowed = manager || user?.role === 'seller';
  const [products, setProducts] = useState<Product[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [draft, setDraft] = useState<Draft>(empty);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(allowed);
  const [feedback, setFeedback] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const [leads, setLeads] = useState<{ id: string; client_name: string; phone: string; seller_id: string | null; status: string }[]>([]);
  const [newClient, setNewClient] = useState(false), [clientName, setClientName] = useState(''), [clientPhone, setClientPhone] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedLead, setSelectedLead] = useState('');
  const [reserveMinutes, setReserveMinutes] = useState('30');
  const [dueAt, setDueAt] = useState(''), [warrantyUntil, setWarrantyUntil] = useState('');
  // Busca sem alterar estado antes do primeiro await (pode rodar dentro do efeito).
  const fetchData = useCallback(async () => {
    if (!allowed) return;
    try {
      const [items, people, totals, customers] = await Promise.all([
        api.get<Product[]>('/products'), api.get<Seller[]>('/products/sellers'),
        manager ? api.get<Metric[]>('/products/metrics', { params: { from: from || undefined, to: to || undefined } }) : Promise.resolve({ data: [] as Metric[] }), api.get('/commercial/leads')
      ]);
      setProducts(items.data); setSellers(people.data); setMetrics(totals.data);
      setLeads(customers.data);
    } catch (error) { setFeedback(errorMessage(error)); }
    finally { setLoading(false); }
  }, [allowed, manager, from, to, setProducts, setSellers, setMetrics, setLeads, setFeedback, setLoading]);
  const load = useCallback(async () => { setLoading(true); await fetchData(); }, [fetchData]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- busca assincrona: o estado so muda depois do await
  useEffect(() => { void fetchData(); }, [fetchData]);
  const change = (key: keyof Draft, value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  const reset = () => setDraft({ ...empty });
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setFeedback('');
    const { cost, supplier_name, commission_rate, ...basic } = draft;
    const body = { ...basic, seller_id: manager ? draft.seller_id : user?.id, ...(manager ? { cost, supplier_name, commission_rate } : {}) };
    try {
      if (draft.id) await api.put(`/products/${encodeURIComponent(draft.id)}`, body);
      else await api.post('/products', body);
      reset(); setFeedback('Produto salvo.'); await load();
    } catch (error) { setFeedback(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function sell(product: Product) {
    if (!selectedLead) { setFeedback('Selecione ou cadastre o cliente desta venda.'); return; }
    if (!window.confirm(`Registrar a venda de ${product.name} por ${money(product.price)} para ${product.seller?.name}?`)) return;
    setBusy(true); setFeedback('');
    try { await api.post(`/products/${encodeURIComponent(product.id)}/sell`, { opportunity_id: selectedLead,
      due_at: dueAt ? new Date(dueAt).toISOString() : undefined, warranty_until: warrantyUntil ? new Date(warrantyUntil).toISOString() : undefined }); setSelectedProduct(null); setFeedback('Venda registrada. Recebimentos e pós-venda estão em Gestão Comercial.'); await load(); }
    catch (error) { setFeedback(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function createClient(event: FormEvent) {
    event.preventDefault(); setBusy(true); setFeedback('');
    try {
      const { data } = await api.post('/commercial/leads', { client_name: clientName, phone: clientPhone });
      if (data.status !== 'open') { setFeedback('Cliente já cadastrado com lead encerrado. Reabra o lead em Gestão Comercial antes de vender.'); return; }
      if (data.seller_id && data.seller_id !== selectedProduct?.seller_id) { setFeedback('Cliente pertence a outro vendedor. Ajuste o responsável em Gestão Comercial.'); return; }
      setLeads(previous => [data, ...previous.filter(lead => lead.id !== data.id)]); setSelectedLead(data.id);
      setNewClient(false); setClientName(''); setClientPhone(''); setFeedback('Cliente vinculado à venda.');
    } catch (error) { setFeedback(errorMessage(error)); } finally { setBusy(false); }
  }
  function edit(product: Product) {
    setDraft({ id: product.id, name: product.name, seller_id: product.seller_id || '', price: String(product.price), down_payment: String(product.down_payment), payment_method: product.payment_method || 'pix', serial: product.serial || '', color: product.color || '', memory: product.memory || '', condition: product.condition || 'new', cost: product.cost == null ? '' : String(product.cost), supplier_name: product.supplier_name || '', commission_rate: String(product.commission_rate || 0) });
    pageRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }
  if (!allowed) return <p className="p-6 text-gray-300">Acesso restrito à equipe de vendas.</p>;
  const count = metrics.reduce((sum, item) => sum + item.count, 0);
  const total = metrics.reduce((sum, item) => sum + item.total, 0);
  return <div ref={pageRef} className="h-full overflow-y-auto p-6 space-y-6 text-white">
    <header><h1 className="text-2xl font-bold">Produtos e vendas</h1><p className="text-gray-400 mt-1">{manager ? 'Produtos e resultados de todos os vendedores da empresa.' : 'Seus produtos e registro de vendas vinculadas ao cliente.'}</p></header>
    <section className="bg-gray-800 border border-gray-700 rounded-xl p-5">
      <h2 className="text-lg font-semibold mb-4">{draft.id ? 'Editar produto' : 'Cadastrar produto'}</h2>
      <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <label className="space-y-1">Produto<input className={fieldClass} value={draft.name} onChange={e => change('name', e.target.value)} required maxLength={160} /></label>
        <label className="space-y-1">Vendedor<select className={fieldClass} value={manager ? draft.seller_id : user?.id || ''} onChange={e => change('seller_id', e.target.value)} disabled={!manager} required><option value="">Selecione um vendedor</option>{sellers.map(seller => <option key={seller.id} value={seller.id}>{seller.name}</option>)}</select></label>
        <label className="space-y-1">Valor (R$)<input className={fieldClass} type="number" min="0.01" max="9999999999.99" step="0.01" value={draft.price} onChange={e => change('price', e.target.value)} required /></label>
        <label className="space-y-1">Forma de pagamento<select className={fieldClass} value={draft.payment_method} onChange={e => change('payment_method', e.target.value)}>{Object.entries(payments).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="space-y-1">Entrada (R$)<input className={fieldClass} type="number" min="0" max={draft.price || undefined} step="0.01" value={draft.down_payment} onChange={e => change('down_payment', e.target.value)} required /></label>
        <label className="space-y-1">Chassi / IMEI<input className={fieldClass} value={draft.serial} onChange={e => change('serial', e.target.value)} maxLength={80} required /></label>
        <label className="space-y-1">Cor<input className={fieldClass} value={draft.color} onChange={e => change('color', e.target.value)} maxLength={60} required /></label>
        <label className="space-y-1">Memória<input className={fieldClass} value={draft.memory} onChange={e => change('memory', e.target.value)} maxLength={60} placeholder="Ex.: 128 GB / não se aplica" /></label>
        {manager && <><label className="space-y-1">Custo de aquisição (R$)<input className={fieldClass} type="number" min="0" step="0.01" value={draft.cost} onChange={e => change('cost', e.target.value)} placeholder="Não informado" /></label><label className="space-y-1">Fornecedor<input className={fieldClass} value={draft.supplier_name} maxLength={160} onChange={e => change('supplier_name', e.target.value)} /></label><label className="space-y-1">Comissão (%)<input className={fieldClass} type="number" min="0" max="100" step="0.01" value={draft.commission_rate} onChange={e => change('commission_rate', e.target.value)} required /></label></>}
        <label className="space-y-1">Estado da moto / aparelho<select className={fieldClass} value={draft.condition} onChange={e => change('condition', e.target.value)}>{Object.entries(conditions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="flex gap-3 items-end"><button disabled={busy || loading || !sellers.length} className="bg-indigo-600 rounded-lg px-4 py-2 disabled:opacity-50">{busy ? 'Salvando…' : 'Salvar produto'}</button><button type="button" onClick={reset} className="border border-gray-600 rounded-lg px-4 py-2">Limpar</button></div>
      </form>
      {!loading && !sellers.length && <p className="mt-3 text-amber-300">Cadastre um usuário com o perfil Vendedor em Gestão de Equipe.</p>}
    </section>
    <p role="status" aria-live="polite" className="text-indigo-200">{feedback}</p>
    {manager && <section className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end"><h2 className="text-xl font-semibold mr-auto">Métricas de vendas</h2><label>Desde<input type="date" className={fieldClass} value={from} onChange={e => setFrom(e.target.value)} /></label><label>Até<input type="date" className={fieldClass} value={to} onChange={e => setTo(e.target.value)} /></label><button onClick={() => void load()} disabled={loading} className="border border-gray-600 rounded-lg px-4 py-2">Atualizar</button></div>
      <p className="text-sm text-gray-400">Somente vendas registradas. Datas no horário de Brasília. Entrada é parte do valor da venda.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[['Vendas', count], ['Total vendido', money(total)], ['Ticket médio', money(count ? total / count : 0)]].map(([label, value]) => <div key={label} className="bg-gray-800 border border-gray-700 rounded-xl p-4"><p className="text-gray-400">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></div>)}</div>
      <div className="overflow-x-auto bg-gray-800 rounded-xl"><table className="w-full text-sm text-left"><thead className="text-gray-400"><tr>{['Vendedor', 'Vendas', 'Total vendido', 'Ticket médio', 'Entradas'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{metrics.map(item => <tr key={item.id} className="border-t border-gray-700"><td className="p-3">{item.name}</td><td className="p-3">{item.count}</td><td className="p-3">{money(item.total)}</td><td className="p-3">{money(item.average)}</td><td className="p-3">{money(item.down_payment)}</td></tr>)}</tbody></table></div>
    </section>}
    <section><h2 className="text-xl font-semibold mb-4">Produtos cadastrados</h2><div className="overflow-x-auto bg-gray-800 rounded-xl"><table className="w-full text-sm text-left"><thead className="text-gray-400"><tr>{['Produto', 'Chassi / IMEI', 'Detalhes', 'Vendedor', 'Valor', 'Pagamento / entrada', 'Status', 'Ações'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{products.map(product => <tr key={product.id} className="border-t border-gray-700">
      <td className="p-3">{product.name}</td><td className="p-3">{product.serial || 'Completar cadastro'}</td><td className="p-3">{[product.color, product.memory, conditions[product.condition || '']].filter(Boolean).join(' / ')}</td><td className="p-3">{product.seller?.name || 'Não atribuído'}</td><td className="p-3 whitespace-nowrap">{money(product.price)}</td><td className="p-3">{payments[product.payment_method || ''] || 'Não informado'} / {money(product.down_payment)}</td><td className="p-3">{product.status === 'returned' ? 'Devolvido — aguardando revisão' : product.status === 'sold' ? `Vendido ${product.sold_at ? new Date(product.sold_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''}` : 'Em estoque'}</td>
      <td className="p-3">{product.status === 'stock' && <div className="flex flex-wrap gap-2"><button className="text-indigo-300" disabled={busy} onClick={() => edit(product)}>Editar</button><button className="text-emerald-300 disabled:opacity-40" disabled={busy || !product.seller_id || !product.serial || !product.payment_method} onClick={() => { setSelectedProduct(product); setSelectedLead(product.reserved_lead_id || ''); setNewClient(false); setDueAt(''); setWarrantyUntil(''); }}>Reservar / vender</button>{product.reserved_until && Date.parse(product.reserved_until) > now && <span className="text-amber-300">Reservado até {new Date(product.reserved_until).toLocaleString('pt-BR')}</span>}</div>}</td>
    </tr>)}</tbody></table>{!products.length && <p className="p-4 text-gray-400">{loading ? 'Carregando…' : 'Nenhum produto cadastrado.'}</p>}</div></section>
    {selectedProduct && <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"><section role="dialog" aria-modal="true" aria-labelledby="sale-title" className="bg-gray-800 border border-gray-600 rounded-xl p-6 max-w-xl w-full space-y-4 max-h-[90vh] overflow-auto">
      <h2 id="sale-title" className="text-xl font-semibold">{selectedProduct.name} · {money(selectedProduct.price)}</h2><p className="text-gray-400">Selecione ou cadastre o cliente para registrar a venda e acompanhar o pós-venda.</p>
      <label className="block">Cliente (obrigatório)<select className={fieldClass} value={selectedLead} required onChange={e => setSelectedLead(e.target.value)}><option value="">Selecione o cliente da venda</option>{leads.filter(lead => lead.status === 'open' && (!lead.seller_id || lead.seller_id === selectedProduct.seller_id)).map(lead => <option key={lead.id} value={lead.id}>{lead.client_name} · +{lead.phone}</option>)}</select></label>
      <button type="button" className="text-indigo-300" disabled={busy} onClick={() => setNewClient(previous => !previous)}>{newClient ? 'Cancelar cadastro' : 'Cadastrar cliente'}</button>
      {newClient && <form onSubmit={createClient} className="space-y-3 border border-gray-600 rounded p-3"><label className="block">Nome do cliente<input className={fieldClass} value={clientName} maxLength={160} required onChange={e => setClientName(e.target.value)} /></label><label className="block">Telefone com DDI<input className={fieldClass} value={clientPhone} maxLength={20} required placeholder="5521999999999" onChange={e => setClientPhone(e.target.value)} /></label><button className="bg-indigo-600 rounded px-3 py-2 disabled:opacity-50" disabled={busy}>Cadastrar e vincular</button></form>}
      <label className="block">Reserva (minutos)<input className={fieldClass} type="number" min="5" max="120" value={reserveMinutes} onChange={e => setReserveMinutes(e.target.value)} /></label>
      <div className="flex gap-4"><button disabled={busy || !selectedLead} className="text-indigo-300" onClick={async () => { setBusy(true); try { await api.post(`/products/${selectedProduct.id}/reserve`, { opportunity_id: selectedLead, minutes: Number(reserveMinutes) }); setFeedback('Reserva criada.'); setSelectedProduct(null); await load(); } catch (error) { setFeedback(errorMessage(error)); } finally { setBusy(false); } }}>Reservar aparelho</button><button disabled={busy} className="text-amber-300" onClick={async () => { setBusy(true); try { await api.delete(`/products/${selectedProduct.id}/reserve`); setFeedback('Reserva liberada.'); setSelectedProduct(null); await load(); } catch (error) { setFeedback(errorMessage(error)); } finally { setBusy(false); } }}>Liberar reserva</button></div>
      <label className="block">Vencimento do recebível<input className={fieldClass} type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label><label className="block">Garantia até<input className={fieldClass} type="datetime-local" value={warrantyUntil} onChange={e => setWarrantyUntil(e.target.value)} /></label>
      <p className="text-sm text-gray-400">Registrar a venda não confirma pagamento nem emite boleto. {manager ? 'Registre recebimentos em Gestão Comercial.' : 'O admin ou supervisor registra os recebimentos.'}</p><p role="status" className="text-indigo-200">{feedback}</p>
      <div className="flex gap-4"><button className="bg-emerald-600 rounded px-4 py-2 disabled:opacity-50" disabled={busy || !selectedLead} onClick={() => void sell(selectedProduct)}>Confirmar venda</button><button disabled={busy} onClick={() => setSelectedProduct(null)}>Fechar</button></div>
    </section></div>}
  </div>;
}
