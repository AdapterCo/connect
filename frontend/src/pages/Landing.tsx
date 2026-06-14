import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

interface Plan {
  id: string;
  name: string;
  max_instances: number;
  max_users: number;
  max_products: number;
  price: number;
}

const planDescriptions: Record<string, string> = {
  Essencial: 'Para pequenos times que precisam organizar atendimento e vendas no WhatsApp.',
  Profissional: 'Para operacoes em crescimento com mais usuarios, conexoes e rotinas comerciais.',
  Empresarial: 'Para empresas com varios atendentes, maior volume e operacao multiatendimento.'
};

const planFeatures: Record<string, string[]> = {
  Essencial: ['CRM de conversas', 'Atendente virtual com IA', 'Kanban de vendas', 'Cobrancas via Mercado Pago'],
  Profissional: ['Tudo do Essencial', 'Mais conexoes WhatsApp', 'Gestao de equipe', 'Relatorios operacionais'],
  Empresarial: ['Tudo do Profissional', 'Limites ampliados', 'Catalogo e pedidos', 'Controle avancado por equipe']
};

function normalizeSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export default function Landing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companySlug, setCompanySlug] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [paymentUrl, setPaymentUrl] = useState('');
  const [error, setError] = useState('');
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) || null,
    [plans, selectedPlanId]
  );

  useEffect(() => {
    api.get('/billing/plans')
      .then((response) => {
        setPlans(response.data);
        setSelectedPlanId(response.data[0]?.id || '');
      })
      .catch(() => setError('Nao foi possivel carregar os planos.'))
      .finally(() => setLoadingPlans(false));
  }, []);

  const handleCompanyNameChange = (value: string) => {
    setCompanyName(value);
    setCompanySlug(normalizeSlug(value));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setPaymentUrl('');
    setSubmitting(true);

    try {
      const response = await api.post('/auth/register-tenant', {
        companyName,
        companySlug,
        adminName,
        adminUsername,
        adminPassword,
        planId: selectedPlanId
      });

      setPaymentUrl(response.data.payment_url || '');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar conta e gerar pagamento.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gray-950/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-xl font-bold">A</div>
            <div>
              <h1 className="text-lg font-bold">Adapter Connect</h1>
              <p className="text-xs text-gray-400">CRM WhatsApp com IA</p>
            </div>
          </div>
          <Link to="/login" className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800">
            Entrar
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-indigo-300">Atendimento, vendas e cobrancas em um painel</p>
            <h2 className="max-w-3xl text-4xl font-bold leading-tight md:text-5xl">
              Organize conversas do WhatsApp, automatize respostas e acompanhe seu funil comercial.
            </h2>
            <p className="mt-5 max-w-2xl text-lg text-gray-300">
              O Adapter Connect centraliza chats, pipeline, atendentes, IA, pedidos, relatorios e recebimentos por Mercado Pago para sua operacao vender e atender melhor.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {['IA para atendimento automatico', 'CRM e kanban de oportunidades', 'Gestao de equipe e limites por plano', 'Links de pagamento Mercado Pago'].map((feature) => (
                <div key={feature} className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-200">
                  {feature}
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
            <h3 className="text-xl font-bold">Criar conta e ativar plano</h3>
            <p className="mt-1 text-sm text-gray-400">Escolha um plano, cadastre a empresa e siga para pagamento.</p>

            {error && (
              <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {paymentUrl && (
              <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
                Conta criada. Conclua o pagamento para ativar o acesso.
                <a href={paymentUrl} target="_blank" rel="noopener noreferrer" className="mt-3 block rounded-lg bg-green-600 px-4 py-2 text-center font-semibold text-white hover:bg-green-700">
                  Ir para pagamento
                </a>
              </div>
            )}

            <div className="mt-5 grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Plano</label>
                <select
                  value={selectedPlanId}
                  onChange={(event) => setSelectedPlanId(event.target.value)}
                  required
                  disabled={loadingPlans}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-indigo-500 focus:outline-none"
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} - R$ {plan.price.toFixed(2).replace('.', ',')}/mes
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">Empresa</label>
                  <input value={companyName} onChange={(event) => handleCompanyNameChange(event.target.value)} required className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-indigo-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">Slug</label>
                  <input value={companySlug} onChange={(event) => setCompanySlug(normalizeSlug(event.target.value))} required className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-indigo-500 focus:outline-none" />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">Nome do admin</label>
                  <input value={adminName} onChange={(event) => setAdminName(event.target.value)} required className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-indigo-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-300">Usuario</label>
                  <input value={adminUsername} onChange={(event) => setAdminUsername(event.target.value.toLowerCase())} required className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-indigo-500 focus:outline-none" />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-300">Senha</label>
                <input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} minLength={6} required className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-indigo-500 focus:outline-none" />
              </div>

              <button type="submit" disabled={submitting || !selectedPlanId} className="rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                {submitting ? 'Gerando pagamento...' : 'Criar conta e pagar'}
              </button>
            </div>
          </form>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-14">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold">Planos disponiveis</h3>
              <p className="mt-1 text-gray-400">Sem plano free. A conta e ativada apos pagamento confirmado.</p>
            </div>
            {selectedPlan && <span className="hidden text-sm text-indigo-300 sm:inline">Selecionado: {selectedPlan.name}</span>}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <button
                type="button"
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`rounded-xl border p-5 text-left transition ${
                  selectedPlanId === plan.id ? 'border-indigo-500 bg-indigo-500/10' : 'border-gray-800 bg-gray-900 hover:border-gray-600'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-lg font-bold">{plan.name}</h4>
                    <p className="mt-2 min-h-12 text-sm text-gray-400">{planDescriptions[plan.name] || 'Plano para uso mensal do Adapter Connect.'}</p>
                  </div>
                  <span className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-300">{plan.max_products} produtos</span>
                </div>
                <p className="mt-5 text-3xl font-bold">R$ {plan.price.toFixed(2).replace('.', ',')}</p>
                <p className="text-sm text-gray-500">por mes para testes</p>
                <ul className="mt-5 space-y-2 text-sm text-gray-300">
                  <li>{plan.max_instances} conexao(oes) WhatsApp</li>
                  <li>{plan.max_products} produtos cadastrados</li>
                  {(planFeatures[plan.name] || []).map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
