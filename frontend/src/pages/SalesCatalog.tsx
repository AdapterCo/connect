import { useCallback, useEffect, useState, type FormEvent } from 'react';
import api, { apiErrorMessage } from '../services/api';
import { useAuthStore } from '../stores/authStore';

interface Model { id: string; name: string; kind: 'phone' | 'motorcycle'; price: string; cost?: string | null; commission_rate?: string; is_active: boolean }
interface Seller { id: string; name: string }
interface Lead { id: string; client_name: string; phone: string; seller_id: string | null; status: string }
interface Unit { id: string; model_id: string | null; name: string; serial: string; color: string; memory: string | null; condition: string; price: number; down_payment: string; status: string; seller_id: string | null; seller: Seller | null; reserved_lead_id: string | null }
interface Metric extends Seller { count: number; total: number; average: number }
const freshSale = { model_id: '', seller_id: '', opportunity_id: '', price: '', down_payment: '0', payment_method: 'pix', serial: '', color: '', memory: '', condition: 'new', due_at: '', warranty_until: '' };
const freshModel = { id: '', name: '', kind: 'phone' as 'phone' | 'motorcycle', price: '', cost: '', commission_rate: '0', is_active: true };
const field = 'w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white disabled:opacity-60';
const button = 'bg-indigo-600 rounded-lg px-4 py-2 disabled:opacity-50';
const section = 'bg-gray-800 border border-gray-700 rounded-xl p-5 space-y-4';
const money = (value: number | string) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const payments = { pix: 'Pix', cash: 'Dinheiro', card: 'Cartão', boleto: 'Boleto' };
const conditions = { new: 'Novo', used: 'Usado', refurbished: 'Recondicionado' };

export default function SalesCatalog() {
  const user = useAuthStore(state => state.user);
  const manager = ['admin', 'supervisor'].includes(user?.role || '');
  const allowed = manager || user?.role === 'seller';
  const [models, setModels] = useState<Model[]>([]), [sellers, setSellers] = useState<Seller[]>([]), [leads, setLeads] = useState<Lead[]>([]), [units, setUnits] = useState<Unit[]>([]), [metrics, setMetrics] = useState<Metric[]>([]);
  const [sale, setSale] = useState(freshSale), [model, setModel] = useState(freshModel);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [newClient, setNewClient] = useState(false), [clientName, setClientName] = useState(''), [clientPhone, setClientPhone] = useState('');
  const selected = models.find(item => item.id === sale.model_id);
  const sellerId = manager ? sale.seller_id : user?.id || '';
  const selectedUnit = units.find(unit => unit.serial === sale.serial && unit.model_id === sale.model_id && unit.status === 'stock');
  const load = useCallback(async () => {
    if (!allowed) return;
    const [a, b, c, d, e] = await Promise.all([api.get<Model[]>('/products/models'), api.get<Seller[]>('/products/sellers'), api.get<Lead[]>('/commercial/leads'), api.get<Unit[]>('/products'), manager ? api.get<Metric[]>('/products/metrics', { params: { from: from || undefined, to: to || undefined } }) : Promise.resolve({ data: [] as Metric[] })]);
    setModels(a.data); setSellers(b.data); setLeads(c.data); setUnits(d.data); setMetrics(e.data);
  }, [allowed, manager, from, to]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- State changes after the HTTP requests resolve.
  useEffect(() => { load().catch(error => setMessage(apiErrorMessage(error, 'Erro ao carregar produtos.'))); }, [load]);
  async function run(work: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage('');
    try { await work(); await load(); setMessage(success); } catch (error) { setMessage(apiErrorMessage(error, error instanceof Error ? error.message : 'Não foi possível concluir.')); } finally { setBusy(false); }
  }
  async function saveSale(event: FormEvent) {
    event.preventDefault();
    if (!selected || !sellerId || !sale.opportunity_id) return;
    if (!window.confirm(`Registrar a venda de ${selected.name} por ${money(sale.price)} para ${leads.find(lead => lead.id === sale.opportunity_id)?.client_name}?`)) return;
    await run(async () => { await api.post('/products/sales', { ...sale, seller_id: sellerId, due_at: sale.due_at ? new Date(sale.due_at).toISOString() : undefined, warranty_until: sale.warranty_until ? new Date(sale.warranty_until).toISOString() : undefined }); setSale(freshSale); }, 'Venda salva e vinculada ao cliente.');
  }
  async function createClient(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const { data } = await api.post<Lead>('/commercial/leads', { client_name: clientName, phone: clientPhone });
      if (data.status !== 'open') throw new Error('Reabra este cliente em Gestão Comercial antes de vender.');
      if (data.seller_id && data.seller_id !== sellerId) throw new Error('Cliente pertence a outro vendedor. Ajuste o responsável em Gestão Comercial.');
      setSale(previous => ({ ...previous, opportunity_id: data.id })); setNewClient(false); setClientName(''); setClientPhone('');
    }, 'Cliente vinculado.');
  }
  if (!allowed) return <p className="p-6">Acesso restrito à equipe de vendas.</p>;
  return <div className="h-full overflow-y-auto p-6 space-y-6 text-white">
    <header><h1 className="text-2xl font-bold">Produtos e vendas</h1><p className="text-gray-400">Selecione um produto do catálogo e informe os dados da unidade ao registrar a venda.</p></header>
    <p role="status" className="text-indigo-200">{message}</p>
    {manager && <section className={section}><h2 className="text-xl font-semibold">{model.id ? 'Editar produto do catálogo' : 'Cadastrar produto no catálogo'}</h2>
      <form className="grid md:grid-cols-3 gap-4" onSubmit={event => { event.preventDefault(); void run(async () => { if (model.id) await api.put(`/products/models/${model.id}`, model); else await api.post('/products/models', model); setModel(freshModel); }, 'Catálogo atualizado.'); }}>
        <label>Produto<input className={field} value={model.name} onChange={e => setModel({ ...model, name: e.target.value })} required maxLength={160} /></label>
        <label>Tipo<select className={field} value={model.kind} onChange={e => setModel({ ...model, kind: e.target.value as Model['kind'] })}><option value="phone">Celular</option><option value="motorcycle">Moto</option></select></label>
        <label>Valor sugerido (R$)<input className={field} type="number" min="0.01" step="0.01" value={model.price} onChange={e => setModel({ ...model, price: e.target.value })} required /></label>
        <label>Custo de referência (R$)<input className={field} type="number" min="0" step="0.01" value={model.cost} onChange={e => setModel({ ...model, cost: e.target.value })} /></label>
        <label>Comissão (%)<input className={field} type="number" min="0" max="100" step="0.01" value={model.commission_rate} onChange={e => setModel({ ...model, commission_rate: e.target.value })} /></label>
        <label className="self-center"><input type="checkbox" checked={model.is_active} onChange={e => setModel({ ...model, is_active: e.target.checked })} /> Produto ativo</label>
        <div className="flex gap-4"><button className={button} disabled={busy}>Salvar produto</button><button type="button" disabled={busy} onClick={() => setModel(freshModel)}>Limpar</button></div>
      </form><p className="text-sm text-gray-400">Cadastre cada modelo uma vez. Dados da unidade são informados na venda. Preço sugerido não confirma estoque.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['Produto', 'Tipo', 'Valor sugerido', 'Situação', 'Ações'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{models.map(item => <tr className="border-t border-gray-700" key={item.id}><td className="p-3">{item.name}</td><td>{item.kind === 'phone' ? 'Celular' : 'Moto'}</td><td>{money(item.price)}</td><td>{item.is_active ? 'Ativo' : 'Inativo'}</td><td><button className="text-indigo-300" disabled={busy} onClick={() => setModel({ ...item, cost: item.cost || '', commission_rate: item.commission_rate || '0' })}>Editar</button></td></tr>)}</tbody></table></div>
    </section>}
    <section className={section}><h2 className="text-xl font-semibold">Cadastrar venda</h2>
      <form onSubmit={saveSale} className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        <label>Produto<select className={field} value={sale.model_id} onChange={e => { const item = models.find(model => model.id === e.target.value); setSale({ ...sale, model_id: e.target.value, price: item?.price || '', serial: '', color: '', memory: '', condition: 'new' }); }} required><option value="">Selecione o produto cadastrado</option>{models.filter(item => item.is_active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Vendedor<select className={field} value={sellerId} onChange={e => setSale({ ...sale, seller_id: e.target.value, opportunity_id: '' })} disabled={!manager} required><option value="">Selecione</option>{sellers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Cliente (obrigatório)<select className={field} value={sale.opportunity_id} onChange={e => setSale({ ...sale, opportunity_id: e.target.value })} required><option value="">Selecione o cliente</option>{leads.filter(lead => lead.status === 'open' && (!lead.seller_id || lead.seller_id === sellerId)).map(lead => <option key={lead.id} value={lead.id}>{lead.client_name} · +{lead.phone}</option>)}</select></label>
        <label>Valor (R$)<input className={field} type="number" min="0.01" step="0.01" value={sale.price} required onChange={e => setSale({ ...sale, price: e.target.value })} /></label>
        <label>Forma de pagamento<select className={field} value={sale.payment_method} onChange={e => setSale({ ...sale, payment_method: e.target.value })}>{Object.entries(payments).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Entrada (R$)<input className={field} type="number" min="0" max={sale.price || undefined} step="0.01" value={sale.down_payment} required onChange={e => setSale({ ...sale, down_payment: e.target.value })} /></label>
        <label>{selected?.kind === 'phone' ? 'IMEI (15 dígitos)' : 'Chassi / série'}<input className={field} value={sale.serial} required maxLength={selected?.kind === 'phone' ? 15 : 80} pattern={selected?.kind === 'phone' ? '[0-9]{15}' : undefined} inputMode={selected?.kind === 'phone' ? 'numeric' : 'text'} onChange={e => setSale({ ...sale, serial: e.target.value })} /></label>
        <label>Cor<input className={field} value={sale.color} required maxLength={60} onChange={e => setSale({ ...sale, color: e.target.value })} /></label>
        {selected?.kind !== 'motorcycle' && <label>Memória<input className={field} value={sale.memory} required maxLength={60} placeholder="Ex.: 128 GB" onChange={e => setSale({ ...sale, memory: e.target.value })} /></label>}
        <label>Estado da moto / aparelho<select className={field} value={sale.condition} onChange={e => setSale({ ...sale, condition: e.target.value })}>{Object.entries(conditions).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Vencimento<input className={field} type="datetime-local" value={sale.due_at} onChange={e => setSale({ ...sale, due_at: e.target.value })} /></label><label>Garantia até<input className={field} type="datetime-local" value={sale.warranty_until} onChange={e => setSale({ ...sale, warranty_until: e.target.value })} /></label>
        <div className="flex gap-4"><button className={button} disabled={busy || !selected || !sale.opportunity_id}>Salvar venda</button><button type="button" disabled={busy} onClick={() => setSale(freshSale)}>Limpar</button><button type="button" className="text-indigo-300" disabled={busy || !sellerId} onClick={() => setNewClient(previous => !previous)}>Cadastrar cliente</button></div>
      </form>
      {newClient && <form onSubmit={createClient} className="grid md:grid-cols-3 gap-3 border-t border-gray-700 pt-4"><label>Nome do cliente<input className={field} value={clientName} onChange={e => setClientName(e.target.value)} required maxLength={160} /></label><label>Telefone com DDI<input className={field} value={clientPhone} onChange={e => setClientPhone(e.target.value)} required maxLength={20} /></label><button className={button} disabled={busy}>Cadastrar e vincular</button></form>}
      {selected && units.some(unit => unit.model_id === selected.id && unit.status === 'stock' && unit.seller_id === sellerId) && <label className="block">Usar unidade já cadastrada em estoque<select className={field} value={selectedUnit?.id || ''} onChange={e => { const unit = units.find(item => item.id === e.target.value); if (unit) setSale({ ...sale, serial: unit.serial, color: unit.color || '', memory: unit.memory || '', condition: unit.condition || 'new', price: String(unit.price), down_payment: String(unit.down_payment), opportunity_id: unit.reserved_lead_id || sale.opportunity_id }); }}><option value="">Informe uma nova unidade</option>{units.filter(unit => unit.model_id === selected.id && unit.status === 'stock' && unit.seller_id === sellerId).map(unit => <option key={unit.id} value={unit.id}>{unit.serial} · {unit.color} · {unit.memory}</option>)}</select></label>}
      {selectedUnit && <div className="flex gap-4"><button className="text-indigo-300" disabled={busy || !sale.opportunity_id} onClick={() => void run(() => api.post(`/products/${selectedUnit.id}/reserve`, { opportunity_id: sale.opportunity_id, minutes: 30 }), 'Unidade reservada por 30 minutos.')}>Reservar unidade</button><button className="text-amber-300" disabled={busy} onClick={() => void run(() => api.delete(`/products/${selectedUnit.id}/reserve`), 'Reserva liberada.')}>Liberar reserva</button></div>}
      {!models.some(item => item.is_active) && <p className="text-amber-300">Peça ao admin ou supervisor para cadastrar os produtos do catálogo.</p>}
      <p className="text-sm text-gray-400">Salvar a venda não confirma pagamento nem emite boleto. Recebimentos e indicadores são restritos a admin e supervisor.</p>
    </section>
    {manager && <section className={section}><h2 className="text-xl font-semibold">Métricas de vendas</h2><div className="flex gap-4"><label>Desde<input type="date" className={field} value={from} onChange={e => setFrom(e.target.value)} /></label><label>Até<input type="date" className={field} value={to} onChange={e => setTo(e.target.value)} /></label></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Vendedor', 'Vendas', 'Total vendido', 'Ticket médio'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{metrics.map(item => <tr className="border-t border-gray-700" key={item.id}><td className="p-3">{item.name}</td><td>{item.count}</td><td>{money(item.total)}</td><td>{money(item.average)}</td></tr>)}</tbody></table></div></section>}
    {manager && <section className={section}><h2 className="text-xl font-semibold">Unidades e vendas registradas</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Produto', 'Chassi / IMEI', 'Detalhes', 'Vendedor', 'Valor', 'Status'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{units.map(unit => <tr key={unit.id} className="border-t border-gray-700"><td className="p-3">{unit.name}</td><td>{unit.serial}</td><td>{[unit.color, unit.memory, conditions[unit.condition as keyof typeof conditions]].filter(Boolean).join(' / ')}</td><td>{unit.seller?.name}</td><td>{money(unit.price)}</td><td>{unit.status === 'sold' ? 'Vendido' : unit.status === 'returned' ? 'Devolvido' : 'Em estoque'}</td></tr>)}</tbody></table></div></section>}
  </div>;
}
