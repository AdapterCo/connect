import { useEffect, useState } from 'react';
import api from '../services/api';

interface Company {
  id: string;
  name: string;
  slug: string;
  plan: string;
  plan_relation?: Plan | null;
  max_instances: number;
  max_users: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  _count: {
    users: number;
    instances: number;
    chats: number;
  };
}

interface Plan {
  id: string;
  name: string;
  max_instances: number;
  max_users: number;
  price: number;
  is_active: boolean;
}

export default function SuperAdmin() {
  const [tab, setTab] = useState<'companies' | 'plans'>('companies');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showCompanyForm, setShowCompanyForm] = useState(false);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);

  useEffect(() => {
    fetchCompanies();
    fetchPlans();
  }, []);

  const fetchCompanies = async () => {
    const res = await api.get('/superadmin/companies');
    setCompanies(res.data);
  };

  const fetchPlans = async () => {
    const res = await api.get('/superadmin/plans');
    setPlans(res.data);
  };

  const handleDeleteCompany = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta empresa? Todos os dados serão perdidos.')) return;
    await api.delete(`/superadmin/companies/${id}`);
    fetchCompanies();
  };

  const handleToggleCompany = async (id: string, is_active: boolean) => {
    await api.put(`/superadmin/companies/${id}`, { is_active: !is_active });
    fetchCompanies();
  };

  const handleDeletePlan = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este plano?')) return;
    try {
      await api.delete(`/superadmin/plans/${id}`);
      fetchPlans();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao excluir plano.');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6">
      <h2 className="text-2xl font-bold mb-6">Painel Super Admin</h2>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('companies')}
          className={`px-4 py-2 rounded-lg font-medium ${tab === 'companies' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300'}`}
        >
          Empresas ({companies.length})
        </button>
        <button
          onClick={() => setTab('plans')}
          className={`px-4 py-2 rounded-lg font-medium ${tab === 'plans' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300'}`}
        >
          Planos ({plans.length})
        </button>
      </div>

      {tab === 'companies' && (
        <div>
          <button
            onClick={() => setShowCompanyForm(!showCompanyForm)}
            className="mb-4 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
          >
            {showCompanyForm ? 'Cancelar' : '➕ Nova Empresa'}
          </button>

          {showCompanyForm && <CompanyForm plans={plans} onClose={() => setShowCompanyForm(false)} onSave={fetchCompanies} />}

          <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-400">Empresa</th>
                  <th className="text-left px-4 py-3 text-gray-400">Plano</th>
                  <th className="text-center px-4 py-3 text-gray-400">Usuários</th>
                  <th className="text-center px-4 py-3 text-gray-400">Instâncias</th>
                  <th className="text-center px-4 py-3 text-gray-400">Chats</th>
                  <th className="text-center px-4 py-3 text-gray-400">Status</th>
                  <th className="text-right px-4 py-3 text-gray-400">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {companies.map(company => (
                  <tr key={company.id} className="hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <div className="text-white font-medium">{company.name}</div>
                      <div className="text-gray-500 text-xs">{company.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded text-xs">
                        {company.plan_relation?.name || company.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-white">
                      {company._count.users}/{company.max_users}
                    </td>
                    <td className="px-4 py-3 text-center text-white">
                      {company._count.instances}/{company.max_instances}
                    </td>
                    <td className="px-4 py-3 text-center text-white">{company._count.chats}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${company.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {company.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handleToggleCompany(company.id, company.is_active)}
                        className={`text-xs ${company.is_active ? 'text-red-400' : 'text-green-400'}`}
                      >
                        {company.is_active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        onClick={() => handleDeleteCompany(company.id)}
                        className="text-xs text-red-400"
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'plans' && (
        <div>
          <button
            onClick={() => { setShowPlanForm(!showPlanForm); setEditingPlan(null); }}
            className="mb-4 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
          >
            {showPlanForm ? 'Cancelar' : '➕ Novo Plano'}
          </button>

          {showPlanForm && <PlanForm plan={editingPlan} onClose={() => { setShowPlanForm(false); setEditingPlan(null); }} onSave={() => { fetchPlans(); setShowPlanForm(false); }} />}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map(plan => (
              <div key={plan.id} className="bg-gray-800 border border-gray-700 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                  <span className={`px-2 py-1 rounded text-xs ${plan.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {plan.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="text-3xl font-bold text-indigo-400 mb-4">
                  R$ {plan.price.toFixed(2)}
                  <span className="text-sm text-gray-400 font-normal">/mês</span>
                </div>
                <ul className="space-y-2 text-sm text-gray-300 mb-4">
                  <li>✓ {plan.max_instances} instância(s) WhatsApp</li>
                  <li>✓ {plan.max_users} usuário(s)</li>
                </ul>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setEditingPlan(plan); setShowPlanForm(true); }}
                    className="flex-1 px-3 py-2 bg-gray-700 text-white rounded text-sm hover:bg-gray-600"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDeletePlan(plan.id)}
                    className="px-3 py-2 border border-red-500/30 text-red-400 rounded text-sm hover:bg-red-500/10"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CompanyForm({ plans, onClose, onSave }: { plans: Plan[]; onClose: () => void; onSave: () => void }) {
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    plan_id: '',
    admin_name: '',
    admin_username: '',
    admin_password: ''
  });
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    try {
      await api.post('/superadmin/companies', formData);
      onSave();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar empresa.');
    }
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-4 max-w-lg">
      <h3 className="font-bold text-white mb-4">Nova Empresa</h3>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Nome da Empresa"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <input
          type="text"
          placeholder="Slug (ex: minha-empresa)"
          value={formData.slug}
          onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <select
          value={formData.plan_id}
          onChange={(e) => setFormData({ ...formData, plan_id: e.target.value })}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
        >
          <option value="">Selecionar Plano</option>
          {plans.filter(p => p.is_active).map(plan => (
            <option key={plan.id} value={plan.id}>{plan.name} - R$ {plan.price}/mês</option>
          ))}
        </select>
        <div className="border-t border-gray-700 pt-3 mt-3">
          <p className="text-sm text-gray-400 mb-2">Administrador da Empresa</p>
        </div>
        <input
          type="text"
          placeholder="Nome do Admin"
          value={formData.admin_name}
          onChange={(e) => setFormData({ ...formData, admin_name: e.target.value })}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <input
          type="text"
          placeholder="Username do Admin"
          value={formData.admin_username}
          onChange={(e) => setFormData({ ...formData, admin_username: e.target.value })}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <input
          type="password"
          placeholder="Senha do Admin"
          value={formData.admin_password}
          onChange={(e) => setFormData({ ...formData, admin_password: e.target.value })}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={handleSubmit}
          className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700"
        >
          Criar Empresa
        </button>
      </div>
    </div>
  );
}

function PlanForm({ plan, onClose: _onClose, onSave }: { plan: Plan | null; onClose: () => void; onSave: () => void }) {
  const [formData, setFormData] = useState({
    name: plan?.name || '',
    max_instances: plan?.max_instances || 1,
    max_users: plan?.max_users || 2,
    price: plan?.price || 0,
    is_active: plan?.is_active ?? true
  });
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    try {
      if (plan) {
        await api.put(`/superadmin/plans/${plan.id}`, formData);
      } else {
        await api.post('/superadmin/plans', formData);
      }
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao salvar plano.');
    }
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-4 max-w-md">
      <h3 className="font-bold text-white mb-4">{plan ? 'Editar Plano' : 'Novo Plano'}</h3>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Nome do Plano"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
        />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400">Max Instâncias</label>
            <input
              type="number"
              value={formData.max_instances}
              onChange={(e) => setFormData({ ...formData, max_instances: parseInt(e.target.value) })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Max Usuários</label>
            <input
              type="number"
              value={formData.max_users}
              onChange={(e) => setFormData({ ...formData, max_users: parseInt(e.target.value) })}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-400">Preço (R$/mês)</label>
          <input
            type="number"
            step="0.01"
            value={formData.price}
            onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={formData.is_active}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            className="rounded"
          />
          Plano Ativo
        </label>
        <button
          onClick={handleSubmit}
          className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700"
        >
          {plan ? 'Atualizar' : 'Criar'} Plano
        </button>
      </div>
    </div>
  );
}
