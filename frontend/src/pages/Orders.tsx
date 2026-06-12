import { useEffect, useState } from 'react';
import api from '../services/api';

interface OrderItem {
  id: string;
  product: { name: string };
  variant_id: string | null;
  variant?: { name: string };
  quantity: number;
  unit_price: number;
  total: number;
  notes: string | null;
  addons: {
    id: string;
    addon: { name: string; price: number };
  }[];
}

interface Order {
  id: string;
  chat_id: string;
  chat: { client_name: string; client_phone: string };
  status: string;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string | null;
  payment_status: string;
  notes: string | null;
  printed: boolean;
  printed_at: string | null;
  created_at: string;
  items: OrderItem[];
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOrders = async () => {
    try {
      const res = await api.get('/orders');
      setOrders(res.data.orders || []);
      setError('');
    } catch (err: any) {
      setError('Erro ao carregar pedidos.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 8000); // Poll every 8s
    return () => clearInterval(interval);
  }, []);

  const handleUpdateStatus = async (id: string, status: string, payment_status?: string) => {
    try {
      await api.put(`/orders/${id}/status`, { status, payment_status });
      fetchOrders();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao atualizar status do pedido.');
    }
  };

  const handlePrint = async (id: string) => {
    try {
      await api.post(`/orders/${id}/print`);
      alert('Impressão disparada com sucesso!');
      fetchOrders();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao disparar impressão.');
    }
  };

  const getStatusColumn = (status: string) => {
    return orders.filter(o => o.status === status);
  };

  const formatPhone = (phone: string) => {
    return phone.replace('@s.whatsapp.net', '');
  };

  const columns = [
    { key: 'pending', title: '🟡 Pendentes', color: 'bg-amber-500/10 border-amber-500/30' },
    { key: 'preparing', title: '🔵 Em Preparo', color: 'bg-blue-500/10 border-blue-500/30' },
    { key: 'completed', title: '🟢 Finalizados', color: 'bg-green-500/10 border-green-500/30' },
    { key: 'cancelled', title: '🔴 Cancelados', color: 'bg-red-500/10 border-red-500/30' }
  ];

  if (isLoading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-hidden flex flex-col p-6 bg-gray-900 text-white">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Painel de Pedidos</h2>
          <p className="text-sm text-gray-400">Gerencie e imprima os pedidos recebidos em tempo real</p>
        </div>
        <button 
          onClick={fetchOrders}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg hover:bg-gray-700 transition"
        >
          🔄 Atualizar
        </button>
      </div>

      {error && <div className="p-3 mb-4 bg-red-500/20 border border-red-500/30 text-red-300 rounded-lg text-sm">{error}</div>}

      <div className="flex-1 overflow-x-auto overflow-y-hidden flex gap-4 pb-4">
        {columns.map(col => {
          const colOrders = getStatusColumn(col.key);
          return (
            <div key={col.key} className="w-80 flex-shrink-0 flex flex-col bg-gray-800/40 border border-gray-700 rounded-xl">
              <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-800/80 rounded-t-xl">
                <span className="font-bold text-sm text-gray-200">{col.title}</span>
                <span className="px-2 py-0.5 bg-gray-700 text-gray-300 rounded-full text-xs font-semibold">{colOrders.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {colOrders.map(order => (
                  <div key={order.id} className={`p-4 border rounded-xl bg-gray-800 transition ${col.color}`}>
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-bold text-indigo-400">
                        #{order.id.slice(-6).toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-400">
                        {new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="mb-3">
                      <p className="font-bold text-sm text-white">{order.chat.client_name}</p>
                      <p className="text-xs text-gray-400">+{formatPhone(order.chat.client_phone)}</p>
                    </div>

                    <div className="space-y-1.5 mb-3 border-y border-gray-700/50 py-2">
                      {order.items?.map((item: any) => (
                        <div key={item.id} className="text-xs text-gray-300">
                          <div className="flex justify-between font-medium">
                            <span>{item.quantity}x {item.product.name}</span>
                            <span>R$ {item.total.toFixed(2)}</span>
                          </div>
                          {item.notes && <p className="text-[10px] text-amber-300 italic pl-2">Obs: {item.notes}</p>}
                        </div>
                      ))}
                    </div>

                    {order.notes && (
                      <div className="mb-3 bg-gray-900/50 p-2 rounded text-[11px] text-gray-300 border-l-2 border-amber-500">
                        <strong>Obs. Geral:</strong> {order.notes}
                      </div>
                    )}

                    <div className="flex justify-between items-center mb-3">
                      <div className="text-xs">
                        <p className="text-gray-400">Pagamento: <span className="text-gray-200 font-semibold">{order.payment_method || 'Entrega'}</span></p>
                        <p className={`font-semibold ${order.payment_status === 'paid' ? 'text-green-400' : 'text-amber-400'}`}>
                          {order.payment_status === 'paid' ? '● Pago' : '● Pendente'}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-bold text-indigo-400">R$ {order.total.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-700/50 text-[10px] text-gray-400 mb-3">
                      <span>{order.printed ? '🖨️ Impresso' : '❌ Não Impresso'}</span>
                      {order.printed_at && (
                        <span>{new Date(order.printed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePrint(order.id)}
                        title="Imprimir Cupom"
                        className="p-1.5 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition text-xs"
                      >
                        🖨️
                      </button>

                      {order.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus(order.id, 'preparing')}
                            className="flex-1 py-1 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition text-xs"
                          >
                            Aceitar
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(order.id, 'cancelled')}
                            className="px-2 py-1 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10 transition text-xs"
                          >
                            Recusar
                          </button>
                        </>
                      )}

                      {order.status === 'preparing' && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus(order.id, 'completed', 'paid')}
                            className="flex-1 py-1 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition text-xs"
                          >
                            Finalizar
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(order.id, 'cancelled')}
                            className="px-2 py-1 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/10 transition text-xs"
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}

                {colOrders.length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-xs">
                    Nenhum pedido nesta etapa.
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
