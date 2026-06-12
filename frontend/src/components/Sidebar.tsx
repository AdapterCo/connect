import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useState, useEffect } from 'react';
import api from '../services/api';

interface PlanInfo {
  plan: {
    name: string;
    max_instances: number;
    max_users: number;
    price: number;
  };
  usage: {
    users: number;
    instances: number;
    chats: number;
  };
  is_active: boolean;
  expires_at: string | null;
}

const navItems = [
  { to: '/', icon: '📊', label: 'Dashboard', end: true },
  { to: '/chats', icon: '💬', label: 'Chats / Funil' },
  { to: '/kanban', icon: '📋', label: 'Pipeline (Kanban)' },
  { to: '/catalog', icon: '📦', label: 'Catálogo' },
  { to: '/whatsapp', icon: '📱', label: 'Conexões WhatsApp' },
  { to: '/settings/ai', icon: '🤖', label: 'Configurações IA' },
  { to: '/settings/mp', icon: '💳', label: 'Recebimentos / MP' },
  { to: '/team', icon: '👥', label: 'Gestão de Equipe', roles: ['admin', 'supervisor'] },
  { to: '/reports', icon: '📈', label: 'Relatórios', roles: ['admin', 'supervisor'] },
  { to: '/billing', icon: '💰', label: 'Faturamento', roles: ['admin', 'supervisor'] },
  { to: '/logs', icon: '📝', label: 'Terminal de Logs' },
  { to: '/superadmin', icon: '🔧', label: 'Super Admin', roles: ['superadmin'] },
];

export default function Sidebar() {
  const { user, logout, updateStatus } = useAuthStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState(user?.status || 'online');
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);

  useEffect(() => {
    if (user?.role !== 'superadmin') {
      api.get('/company/plan-info')
        .then(res => setPlanInfo(res.data))
        .catch(() => {});
    }
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleStatusChange = async (newStatus: 'online' | 'offline') => {
    setStatus(newStatus);
    await updateStatus(newStatus);
  };

  const filteredNavItems = navItems.filter(item => {
    if (!item.roles) return true;
    return user && item.roles.includes(user.role);
  });

  const isNearLimit = planInfo && (
    planInfo.usage.users >= planInfo.plan.max_users - 1 ||
    planInfo.usage.instances >= planInfo.plan.max_instances - 1
  );

  return (
    <aside className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-xl">
            A
          </div>
          <div>
            <h1 className="font-bold text-white">Adapter Connect</h1>
            <span className="text-xs text-gray-400">CRM WhatsApp com IA</span>
          </div>
        </div>
      </div>

      {planInfo && (
        <div className={`mx-4 mt-4 p-3 rounded-lg border ${!planInfo.is_active ? 'bg-red-500/10 border-red-500/30' : isNearLimit ? 'bg-amber-500/10 border-amber-500/30' : 'bg-gray-700/50 border-gray-600'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs font-bold uppercase ${!planInfo.is_active ? 'text-red-400' : 'text-indigo-400'}`}>
              {planInfo.plan.name}
            </span>
            {!planInfo.is_active && <span className="text-xs text-red-400">Expirado</span>}
          </div>
          <div className="text-xs text-gray-400 space-y-0.5">
            <div className="flex justify-between">
              <span>Usuários:</span>
              <span className={planInfo.usage.users >= planInfo.plan.max_users ? 'text-red-400' : 'text-white'}>
                {planInfo.usage.users}/{planInfo.plan.max_users}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Conexões:</span>
              <span className={planInfo.usage.instances >= planInfo.plan.max_instances ? 'text-red-400' : 'text-white'}>
                {planInfo.usage.instances}/{planInfo.plan.max_instances}
              </span>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {filteredNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`
            }
          >
            <span>{item.icon}</span>
            <span className="text-sm font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-700 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-sm font-bold">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
            <p className="text-xs text-gray-400 uppercase">{user?.role}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value as 'online' | 'offline')}
            className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white"
          >
            <option value="online">🟢 Online</option>
            <option value="offline">⚫ Offline</option>
          </select>
          <button
            onClick={handleLogout}
            className="px-3 py-1 border border-red-500/30 text-red-400 rounded text-xs font-medium hover:bg-red-500/10"
          >
            Sair
          </button>
        </div>

        <p className="text-center text-xs text-gray-500">Adapter Connect v1.0.2</p>
      </div>
    </aside>
  );
}
