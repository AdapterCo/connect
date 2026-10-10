import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  Bot, Columns3, CreditCard, LayoutDashboard, LineChart, LogOut, MessagesSquare, Package, Receipt,
  ScrollText, ShieldCheck, Smartphone, TrendingUp, Users, Workflow, type LucideIcon
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';
import BrandMark from './BrandMark';

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

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  roles?: string[];
  end?: boolean;
}

// Agrupado pelo que a pessoa faz no dia: atender, vender, administrar.
const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: 'Atendimento',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Painel', end: true },
      { to: '/chats', icon: MessagesSquare, label: 'Conversas' },
      { to: '/kanban', icon: Columns3, label: 'Funil de vendas' },
      { to: '/fluxos', icon: Workflow, label: 'Fluxos automáticos', roles: ['admin', 'supervisor'] }
    ]
  },
  {
    title: 'Vendas',
    items: [
      { to: '/commercial', icon: TrendingUp, label: 'Gestão comercial', roles: ['admin', 'supervisor', 'seller'] },
      { to: '/sales', icon: Receipt, label: 'Vendas', roles: ['admin', 'supervisor', 'seller'] },
      { to: '/catalog', icon: Package, label: 'Produtos', roles: ['admin', 'supervisor'] }
    ]
  },
  {
    title: 'Gestão',
    items: [
      { to: '/team', icon: Users, label: 'Equipe', roles: ['admin', 'supervisor'] },
      { to: '/reports', icon: LineChart, label: 'Relatórios', roles: ['admin', 'supervisor'] },
      { to: '/whatsapp', icon: Smartphone, label: 'Conexões WhatsApp', roles: ['admin', 'supervisor'] },
      { to: '/settings/ai', icon: Bot, label: 'Assistente de IA', roles: ['admin'] },
      { to: '/billing', icon: CreditCard, label: 'Assinatura', roles: ['admin'] },
      { to: '/logs', icon: ScrollText, label: 'Registro de atividades', roles: ['admin'] }
    ]
  },
  {
    title: 'Plataforma',
    items: [{ to: '/superadmin', icon: ShieldCheck, label: 'Super Admin', roles: ['superadmin'] }]
  }
];

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Super admin',
  admin: 'Administrador',
  supervisor: 'Supervisor',
  seller: 'Vendedor',
  support: 'Suporte',
  other: 'Colaborador'
};

function UsageMeter({ label, used, max }: { label: string; used: number; max: number }) {
  const ratio = max > 0 ? Math.min(used / max, 1) : 0;
  const tone = used >= max ? 'bg-red-400' : ratio >= 0.8 ? 'bg-indigo-500' : 'bg-gray-400';
  return (
    <div>
      <div className="flex justify-between text-[11px] text-gray-400">
        <span>{label}</span>
        <span className="tabular-nums text-gray-200">{used}/{max}</span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-gray-700">
        <div className={`h-1 rounded-full ${tone}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

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

  const visible = (item: NavItem) => !item.roles || Boolean(user && item.roles.includes(user.role));
  const groups = navGroups
    .map(group => ({
      ...group,
      items: group.items.filter(visible).map(item => item.to === '/sales' && user?.role === 'seller' ? { ...item, label: 'Cadastrar venda' } : item)
    }))
    .filter(group => group.items.length > 0);

  const online = status === 'online';

  return (
    <aside className="flex w-64 flex-col border-r border-gray-700 bg-gray-800">
      <div className="flex items-center gap-3 px-5 py-5">
        <BrandMark className="h-8 w-8" />
        <div className="leading-tight">
          <p className="font-semibold text-gray-50 [font-stretch:112.5%]">Adapter Connect</p>
          <p className="text-xs text-gray-400">Atendimento e vendas</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Navegação principal">
        {groups.map(group => (
          <div key={group.title}>
            <p className="px-3 pb-1 text-xs font-medium text-gray-500">{group.title}</p>
            <ul className="space-y-0.5">
              {group.items.map(({ to, icon: Icon, label, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) =>
                      `relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? 'bg-gray-700 font-medium text-gray-50 before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-indigo-500'
                          : 'text-gray-300 hover:bg-gray-700/60 hover:text-gray-50'
                      }`
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {planInfo && (
        <div className="mx-3 mb-3 space-y-2 rounded-md border border-gray-700 bg-gray-900/60 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-gray-200">Plano {planInfo.plan.name}</span>
            {!planInfo.is_active && <span className="text-red-400">Expirado</span>}
          </div>
          <UsageMeter label="Usuários" used={planInfo.usage.users} max={planInfo.plan.max_users} />
          <UsageMeter label="Conexões" used={planInfo.usage.instances} max={planInfo.plan.max_instances} />
          <UsageMeter label="Produtos" used={planInfo.usage.products} max={planInfo.plan.max_products} />
        </div>
      )}

      <div className="space-y-3 border-t border-gray-700 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-700 text-sm font-semibold text-gray-100">
            {user?.name?.charAt(0).toUpperCase() || 'U'}
            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-gray-700 ${online ? 'bg-telemetry' : 'bg-gray-500'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-50">{user?.name}</p>
            <p className="text-xs text-gray-400">{ROLE_LABELS[user?.role || ''] || user?.role}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md p-2 text-gray-400 hover:bg-gray-700 hover:text-gray-50"
            aria-label="Sair"
            title="Sair"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Disponibilidade define quem recebe leads no rodizio de vendedores. */}
        <div className="grid grid-cols-2 rounded-md border border-gray-700 p-0.5 text-xs" role="radiogroup" aria-label="Disponibilidade">
          {(['online', 'offline'] as const).map(value => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={status === value}
              onClick={() => handleStatusChange(value)}
              className={`rounded px-2 py-1.5 transition-colors ${status === value ? 'bg-gray-700 font-medium text-gray-50' : 'text-gray-400 hover:text-gray-200'}`}
            >
              {value === 'online' ? 'Disponível' : 'Ausente'}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
