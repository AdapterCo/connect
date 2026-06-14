import { useEffect, useState } from 'react';
import api from '../services/api';

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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [invoicesRes, planRes] = await Promise.all([
        api.get('/billing/invoices'),
        api.get('/company/plan-info')
      ]);
      setInvoices(invoicesRes.data);
      setPlanInfo(planRes.data);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

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
    <div className="h-full overflow-y-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Faturamento</h2>

      {planInfo && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-bold text-white mb-4">Plano Atual</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-sm text-gray-400">Plano</p>
              <p className="text-xl font-bold text-indigo-400">{planInfo.plan.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Valor</p>
              <p className="text-xl font-bold text-white">
                R$ {planInfo.plan.price.toFixed(2)}/mês
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-400">Produtos</p>
              <p className="text-xl font-bold text-white">
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
              <p className="text-xl font-bold text-white">
                {planInfo.expires_at ? new Date(planInfo.expires_at).toLocaleDateString('pt-BR') : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-lg font-bold text-white">Histórico de Faturas</h3>
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
                  <td className="px-4 py-3 text-white">
                    {new Date(invoice.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {invoice.subscription?.plan?.name || 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-white font-medium">
                    R$ {invoice.amount.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-gray-300">
                    {new Date(invoice.due_date).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(invoice.status)}</td>
                  <td className="px-4 py-3 text-right">
                    {invoice.status === 'pending' && invoice.mp_payment_url && (
                      <a
                        href={invoice.mp_payment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 text-sm"
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
