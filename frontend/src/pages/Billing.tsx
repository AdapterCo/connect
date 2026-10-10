import { useCallback, useEffect, useState } from 'react';
import api, { apiErrorMessage } from '../services/api';
import { useAuthStore } from '../stores/authStore';

interface Invoice {
  id: string;
  amount: number;
  status: string;
  mp_payment_url: string | null;
  due_date: string;
  paid_at: string | null;
  created_at: string;
  subscription?: {
    plan: {
      name: string;
    };
  };
}

interface PlanInfo {
  plan: {
    name: string;
    max_instances: number;
    max_users: number;
    max_products: number;
    price: number;
  };
  usage: {
    users: number;
    instances: number;
    products: number;
    chats: number;
  };
  is_active: boolean;
  expires_at: string | null;
}

export default function Billing() {
  const [plans, setPlans] = useState<{ id: string; name: string; price: number }[]>([]);
  const [planId, setPlanId] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [error, setError] = useState('');
  const [pix, setPix] = useState<{ qr_code: string; qr_code_base64: string; invoice_id: string } | null>(null);
  const [payerEmail, setPayerEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const pay = async (id: string) => {
    setBusy(true); setError('');
    try { const response = await api.post('/billing/checkout/' + id + '/payment', { method: 'pix', payer_email: payerEmail }); setPix(response.data.payment); }
    catch (err) { setError(apiErrorMessage(err, 'Nao foi possivel gerar Pix.')); } finally { setBusy(false); }
  };
  const confirm = async () => {
    if (!pix) return;
    setBusy(true); setError('');
    try { const response = await api.get('/billing/checkout/' + pix.invoice_id + '/status');
      if (response.data.status === 'paid') { setPix(null); await useAuthStore.getState().initialize(); await loadData(); }
      else setError('Pagamento ainda nao confirmado.');
    } catch (err) { setError(apiErrorMessage(err, 'Falha na confirmacao.')); } finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!window.confirm('Cancelar renovacao? O acesso permanece ate o fim do periodo pago.')) return;
    try { await api.post('/billing/cancel'); await loadData(); } catch (err) { setError(apiErrorMessage(err, 'Falha ao cancelar.')); }
  };
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [invoicesRes, planRes, plansRes] = await Promise.all([
        api.get('/billing/invoices'),
        api.get('/company/plan-info'),
        api.get('/billing/plans')
      ]);
      setPlans(plansRes.data);
      setError('');
      setInvoices(invoicesRes.data);
      setPlanInfo(planRes.data);
    } catch (error) {
      setError(apiErrorMessage(error, 'Nao foi possivel carregar o faturamento.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      paid: 'bg-green-500/20 text-green-400',
      pending: 'bg-amber-500/20 text-amber-400',
      failed: 'bg-red-500/20 text-red-400',
      cancelled: 'bg-gray-500/20 text-gray-400'
    };
    const labels: Record<string, string> = {
      paid: 'Pago',
      pending: 'Pendente',
      failed: 'Falhou',
      cancelled: 'Cancelado'
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status] || styles.pending}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2 className="text-2xl font-bold mb-6">Faturamento</h2>
      {error && <p role="alert" className="text-red-300 mb-4">{error} <button onClick={loadData}>Tentar novamente</button></p>}
      <label className="block mb-4">E-mail do pagador <input type="email" value={payerEmail} onChange={event => setPayerEmail(event.target.value)} className="bg-gray-700 p-2 rounded" /></label>
      <div className="flex gap-2 mb-4"><select aria-label="Plano para nova assinatura" value={planId} onChange={event => setPlanId(event.target.value)} className="bg-gray-700 p-2 rounded"><option value="">Selecionar plano para assinar novamente</option>{plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name} - R$ {Number(plan.price).toFixed(2)}</option>)}</select><button disabled={busy || !planId} onClick={async () => {
        setBusy(true); setError('');
        try { await api.post('/billing/subscribe', { planId }); await loadData(); } catch (error) { setError(apiErrorMessage(error, 'Nao foi possivel criar a assinatura.')); } finally { setBusy(false); }
      }}>Nova assinatura</button></div>
      <button className="mb-4 text-red-300" onClick={cancel}>Cancelar renovacao</button>
      {pix && <div className="mb-4"><img alt="QR Code Pix" className="w-56" src={'data:image/png;base64,' + pix.qr_code_base64} /><textarea aria-label="Pix copia e cola" readOnly value={pix.qr_code} className="bg-gray-700 w-full" /><button disabled={busy} onClick={confirm}>Verificar pagamento</button></div>}

      {planInfo && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-bold text-gray-50 mb-4">Plano Atual</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-sm text-gray-400">Plano</p>
              <p className="text-xl font-bold text-indigo-300">{planInfo.plan.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Valor</p>
              <p className="text-xl font-bold text-gray-50">
                R$ {planInfo.plan.price.toFixed(2)}/mês
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Produtos</p>
              <p className="text-xl font-bold text-gray-50">
                {planInfo.usage.products}/{planInfo.plan.max_products}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Status</p>
              <p className={`text-xl font-bold ${planInfo.is_active ? 'text-green-400' : 'text-red-400'}`}>
                {planInfo.is_active ? 'Ativo' : 'Inativo'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Expira em</p>
              <p className="text-xl font-bold text-gray-50">
                {planInfo.expires_at ? new Date(planInfo.expires_at).toLocaleDateString('pt-BR') : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-lg font-bold text-gray-50">Histórico de Faturas</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-700/50">
            <tr>
              <th className="text-left px-4 py-3 text-gray-400">Data</th>
              <th className="text-left px-4 py-3 text-gray-400">Plano</th>
              <th className="text-left px-4 py-3 text-gray-400">Valor</th>
              <th className="text-left px-4 py-3 text-gray-400">Vencimento</th>
              <th className="text-left px-4 py-3 text-gray-400">Status</th>
              <th className="text-right px-4 py-3 text-gray-400">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Nenhuma fatura encontrada
                </td>
              </tr>
            ) : (
              invoices.map(invoice => (
                <tr key={invoice.id} className="hover:bg-gray-700/30">
                  <td className="px-4 py-3 text-gray-50">
                    {new Date(invoice.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {invoice.subscription?.plan?.name || 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-gray-50 font-medium">
                    R$ {invoice.amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {new Date(invoice.due_date).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(invoice.status)}</td>
                  <td className="px-4 py-3 text-right">
                    {['pending', 'failed'].includes(invoice.status) && <button disabled={busy || !payerEmail} onClick={() => pay(invoice.id)} className="text-indigo-300">Gerar Pix</button>}
                    {invoice.status === 'pending' && invoice.mp_payment_url && (
                      <a
                        href={invoice.mp_payment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-300 hover:text-indigo-300 text-sm"
                      >
                        Pagar
                      </a>
                    )}
                    {invoice.status === 'paid' && invoice.paid_at && (
                      <span className="text-xs text-gray-500">
                        Pago em {new Date(invoice.paid_at).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
