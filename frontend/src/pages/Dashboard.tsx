import { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const { chats, logs, fetchChats, fetchLogs } = useAppStore();

  useEffect(() => {
    fetchChats();
    fetchLogs();
  }, [fetchChats, fetchLogs]);

  const totalChats = chats.length;
  const iniciadaCount = chats.filter(c => c.status === 'iniciada').length;
  const interesseCount = chats.filter(c => c.status === 'interesse em compra').length;
  const finalizadaCount = chats.filter(c => c.status === 'finalizada').length;

  const chartData = [
    { name: 'Iniciada', value: iniciadaCount, fill: '#6366f1' },
    { name: 'Interesse', value: interesseCount, fill: '#f59e0b' },
    { name: 'Finalizada', value: finalizadaCount, fill: '#10b981' },
  ];

  const recentLogs = logs.slice(0, 10);

  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon="💬" label="Total de Chats" value={totalChats} color="indigo" />
        <StatCard icon="➕" label="Status: Iniciada" value={iniciadaCount} color="blue" />
        <StatCard icon="🛒" label="Interesse de Compra" value={interesseCount} color="amber" />
        <StatCard icon="✅" label="Compras Finalizadas" value={finalizadaCount} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Funil de Vendas Recentes</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Últimas Ações</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {recentLogs.length === 0 ? (
              <p className="text-gray-500 text-sm">Nenhum log registrado.</p>
            ) : (
              recentLogs.map((log, index) => (
                <div key={index} className="flex gap-3 text-sm">
                  <span className="text-gray-500 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-gray-300">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  const colorClasses: Record<string, string> = {
    indigo: 'bg-indigo-500/10 text-indigo-400',
    blue: 'bg-blue-500/10 text-blue-400',
    amber: 'bg-amber-500/10 text-amber-400',
    green: 'bg-green-500/10 text-green-400',
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${colorClasses[color]}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-sm text-gray-400">{label}</p>
      </div>
    </div>
  );
}
