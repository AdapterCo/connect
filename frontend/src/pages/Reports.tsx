import { useEffect, useState } from 'react';
import api from '../services/api';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import type { Statistics } from '../types';

export default function Reports() {
  const [stats, setStats] = useState<Statistics | null>(null);

  useEffect(() => {
    api.get('/statistics').then(res => setStats(res.data));
  }, []);

  if (!stats) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  const sectorData = [
    { name: 'Vendas', value: stats.sectors.sales, fill: '#6366f1' },
    { name: 'Suporte', value: stats.sectors.support, fill: '#10b981' },
    { name: 'Financeiro', value: stats.sectors.finance, fill: '#f59e0b' },
    { name: 'Sem Setor', value: stats.sectors.none, fill: '#6b7280' },
  ];

  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Relatórios e Métricas</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total de Chats" value={stats.kpis.totalChats} />
        <StatCard label="TMR Médio (Humano)" value={`${stats.kpis.tmrHumano}s`} />
        <StatCard label="TMR Médio (IA)" value={`${stats.kpis.tmrAi}s`} />
        <StatCard label="TMA Médio" value={`${stats.kpis.tmaGeral}s`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="font-bold text-white mb-4">Volume de Mensagens (7 dias)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="label" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
                <Bar dataKey="clientMessages" name="Clientes" fill="#6366f1" />
                <Bar dataKey="attendantMessages" name="Atendentes" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
          <h3 className="font-bold text-white mb-4">Distribuição por Setor</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sectorData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {sectorData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
        <h3 className="font-bold text-white mb-4">Desempenho da Equipe</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-gray-400">
                <th className="text-left py-3 px-4">Atendente</th>
                <th className="text-left py-3 px-4">Função</th>
                <th className="text-center py-3 px-4">Status</th>
                <th className="text-center py-3 px-4">Chats Ativos</th>
                <th className="text-center py-3 px-4">Respostas</th>
                <th className="text-center py-3 px-4">TMR</th>
                <th className="text-center py-3 px-4">TMA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {stats.attendants.map(att => (
                <tr key={att.id} className="hover:bg-gray-700/30">
                  <td className="py-3 px-4 text-white">{att.name}</td>
                  <td className="py-3 px-4 text-gray-400">{att.role}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex items-center gap-1 ${att.status === 'online' ? 'text-green-400' : 'text-gray-500'}`}>
                      <span className={`w-2 h-2 rounded-full ${att.status === 'online' ? 'bg-green-400' : 'bg-gray-500'}`} />
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center text-white">{att.activeChats}</td>
                  <td className="py-3 px-4 text-center text-white">{att.repliesCount}</td>
                  <td className="py-3 px-4 text-center text-white">{att.tmr}s</td>
                  <td className="py-3 px-4 text-center text-white">{att.tma}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  );
}
