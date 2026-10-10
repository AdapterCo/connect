import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react';
import api, { apiErrorMessage } from '../services/api';
import BrandMark from '../components/BrandMark';

interface Plan {
  id: string;
  name: string;
  max_instances: number;
  max_users: number;
  max_products: number;
  price: number;
}

interface CheckoutConfig {
  public_key: string;
  pix_enabled: boolean;
  card_enabled: boolean;
}

interface CheckoutInvoice {
  id: string;
  amount: number;
  status: string;
  company: { name: string; slug: string };
  plan: Plan | null;
}

interface PixPayment {
  qr_code: string | null;
  qr_code_base64: string | null;
  ticket_url: string | null;
  status: string;
}

const planDescriptions: Record<string, string> = {
  Essencial: 'Para lojas pequenas organizarem atendimento e vendas no WhatsApp.',
  Profissional: 'Para lojas em crescimento, com mais vendedores e números de WhatsApp.',
  Empresarial: 'Para lojas com vários vendedores, mais números de WhatsApp e maior volume de conversas.'
};

// Todos os planos tem os mesmos recursos; mudam apenas os limites.
const planFeatures: Record<string, string[]> = {
  Essencial: ['Conversas do WhatsApp em um painel', 'Assistente de IA e fluxos automáticos', 'Funil de vendas e rodízio de vendedores', 'Registro de vendas e comissões'],
  Profissional: ['Tudo do Essencial', 'Mais usuários e números de WhatsApp', 'Mais produtos no catálogo'],
  Empresarial: ['Tudo do Profissional', 'Limites ampliados para equipes grandes']
};

function normalizeSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getMercadoPagoClientErrorMessage(err: unknown) {
  const candidate = (err ?? {}) as { message?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  const serialized = (() => {
    try {
      return JSON.stringify(err);
    } catch {
      return '';
    }
  })();
  const raw = `${message} ${serialized}`.toLowerCase();

  if (raw.includes('public key not found') || raw.includes('"status":404') || raw.includes('status: 404')) {
    return 'O pagamento com cartão está indisponível no momento. Use o Pix ou tente novamente mais tarde.';
  }

  if (raw.includes('form could not be submitted')) {
    return 'Não foi possível validar os dados do cartão. Confira as informações e tente novamente.';
  }

  if (raw.includes('failed to fetch') || raw.includes('cors') || raw.includes('err_failed')) {
    return 'Não foi possível validar o cartão agora. Tente novamente ou use o Pix.';
  }

  return message || 'Não foi possível carregar o pagamento com cartão.';
}

function getCardPaymentFailureMessage(payment: { payment_status_detail?: string } | null | undefined) {
  const detail = payment?.payment_status_detail;
  if (detail) {
    return `O pagamento não foi aprovado (${detail}). Confira os dados do cartão ou use outra forma de pagamento.`;
  }

  return 'O pagamento não foi aprovado. Confira os dados do cartão ou use outra forma de pagamento.';
}

// Dados entregues pelo formulario de cartao do Mercado Pago (Card Payment Brick).
interface CardFormData {
  token?: string;
  issuer_id?: string;
  payment_method_id?: string;
  installments?: number;
  payer?: { email?: string; identification?: { type?: string; number?: string } };
}

// O que acontece com cada mensagem de cliente, na ordem.
const LEAD_PATH = [
  { title: 'O cliente chama no WhatsApp', text: 'Todas as linhas da loja chegam em um só painel.' },
  { title: 'Fluxo ou IA responde na hora', text: 'Perguntas, menus e o catálogo de produtos qualificam o interesse.' },
  { title: 'O rodízio entrega ao vendedor disponível', text: 'Sem resposta em 60 segundos, a conversa passa para o próximo.' },
  { title: 'A venda é registrada', text: 'Metas, comissões e relatórios por vendedor ficam atualizados.' }
];

export default function Landing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companySlug, setCompanySlug] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [payerEmail, setPayerEmail] = useState('');
  const [checkoutConfig, setCheckoutConfig] = useState<CheckoutConfig | null>(null);
  const [checkoutInvoice, setCheckoutInvoice] = useState<CheckoutInvoice | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
  const [pixPayment, setPixPayment] = useState<PixPayment | null>(null);
  const [paymentApproved, setPaymentApproved] = useState(false);
  const [error, setError] = useState('');
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [cardReady, setCardReady] = useState(false);
  const [cardSdkReady, setCardSdkReady] = useState(false);
  const [cardNotice, setCardNotice] = useState('');
  const [cardError, setCardError] = useState('');
  const [cardBrickKey, setCardBrickKey] = useState(0);

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) || null,
    [plans, selectedPlanId]
  );

  useEffect(() => {
    Promise.all([api.get('/billing/plans'), api.get('/billing/checkout/config')])
      .then(([plansResponse, configResponse]) => {
        setPlans(plansResponse.data);
        setSelectedPlanId(plansResponse.data[0]?.id || '');
        setCheckoutConfig(configResponse.data);
        // Inicializa o SDK de cartao assim que a chave publica chega.
        if (configResponse.data?.public_key) {
          initMercadoPago(configResponse.data.public_key, { locale: 'pt-BR' });
          setCardSdkReady(true);
        }
      })
      .catch(() => setError('Não foi possível carregar os planos. Recarregue a página.'))
      .finally(() => setLoadingPlans(false));
  }, []);

  useEffect(() => {
    if (!checkoutInvoice || paymentApproved) return;

    const interval = window.setInterval(async () => {
      try {
        const response = await api.get(`/billing/checkout/${checkoutInvoice.id}/status`);
        if (response.data.status === 'paid') {
          setPaymentApproved(true);
          window.clearInterval(interval);
        }
      } catch {
        // keep polling silently
      }
    }, 5000);

    return () => window.clearInterval(interval);
  }, [checkoutInvoice, paymentApproved]);

  useEffect(() => {
    const id = sessionStorage.getItem('crm_pending_checkout');
    if (!id) return;
    api.get('/billing/checkout/' + id).then(response => {
      if (response.data.status === 'paid') { sessionStorage.removeItem('crm_pending_checkout'); return; }
      setCheckoutInvoice(response.data);
    }).catch(() => sessionStorage.removeItem('crm_pending_checkout'));
  }, []);
  const handleCompanyNameChange = (value: string) => {
    setCompanyName(value);
    setCompanySlug(normalizeSlug(value));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setPixPayment(null);
    setPaymentApproved(false);
    setSubmitting(true);

    try {
      const response = await api.post('/auth/register-tenant', {
        companyName,
        companySlug,
        adminName,
        adminUsername,
        adminPassword,
        planId: selectedPlanId,
        payerEmail
      });

      sessionStorage.setItem('crm_pending_checkout', response.data.invoice.id);
      setCheckoutInvoice({
        id: response.data.invoice.id,
        amount: response.data.invoice.amount,
        status: response.data.invoice.status,
        company: response.data.company,
        plan: selectedPlan
      });
      setPayerEmail(payerEmail || `${adminUsername}@${companySlug}.com.br`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Erro ao criar conta.'));
    } finally {
      setSubmitting(false);
    }
  };

  const createPixPayment = async () => {
    if (!checkoutInvoice) return;
    setCreatingPayment(true);
    setError('');

    try {
      const response = await api.post(`/billing/checkout/${checkoutInvoice.id}/payment`, {
        method: 'pix',
        payer_email: payerEmail
      });

      setPixPayment({
        qr_code: response.data.payment.qr_code,
        qr_code_base64: response.data.payment.qr_code_base64,
        ticket_url: response.data.payment.ticket_url,
        status: response.data.payment.payment_status || 'pending'
      });
    } catch (err) {
      setError(apiErrorMessage(err, 'Erro ao gerar Pix.'));
    } finally {
      setCreatingPayment(false);
    }
  };

  // So recria a configuracao (e reinicia o formulario de cartao) quando o valor ou o e-mail mudam.
  const invoiceAmount = checkoutInvoice?.amount;
  const cardPaymentInitialization = useMemo(() => {
    if (invoiceAmount === undefined) return null;

    return {
      amount: invoiceAmount,
      payer: { email: payerEmail }
    };
  }, [invoiceAmount, payerEmail]);

  const cardPaymentCustomization = useMemo(() => ({
    paymentMethods: {
      minInstallments: 1,
      maxInstallments: 1,
      types: { included: ['credit_card', 'debit_card'] as Array<'credit_card' | 'debit_card'> }
    },
    visual: {
      hideFormTitle: true
    }
  }), []);

  const handleCardPaymentReady = useCallback(() => {
    setCardReady(true);
  }, []);

  const handleCardPaymentSubmit = useCallback(async (cardData: CardFormData) => {
    if (!checkoutInvoice) return;

    setCreatingPayment(true);
    setCardNotice('Processando o pagamento. Não feche esta página.');
    setCardError('');

    try {
      if (!cardData?.token || !cardData?.payment_method_id) {
        const message = 'Não foi possível validar os dados do cartão. Confira as informações e tente novamente.';
        setCardNotice('');
        setCardError(message);
        setCardReady(false);
        setCardBrickKey((current) => current + 1);
        throw new Error(message);
      }

      const response = await api.post(`/billing/checkout/${checkoutInvoice.id}/payment`, {
        method: 'card',
        payer_email: payerEmail || cardData.payer?.email,
        token: cardData.token,
        issuer_id: cardData.issuer_id,
        payment_method_id: cardData.payment_method_id,
        installments: cardData.installments,
        identification_type: cardData.payer?.identification?.type,
        identification_number: cardData.payer?.identification?.number
      });

      if (response.data.payment.status === 'paid' || response.data.payment.payment_status === 'approved') {
        setCardNotice('Pagamento aprovado. Ativando sua conta...');
        setPaymentApproved(true);
      } else {
        const message = getCardPaymentFailureMessage(response.data.payment);
        setCardNotice('');
        setCardError(message);
        setCardReady(false);
        setCardBrickKey((current) => current + 1);
        throw new Error(message);
      }
    } catch (err) {
      const message = apiErrorMessage(err, getMercadoPagoClientErrorMessage(err) || 'O pagamento não foi aprovado. Confira os dados do cartão ou use outra forma de pagamento.');
      setCardNotice('');
      setCardError(message);
      setCardReady(false);
      setCardBrickKey((current) => current + 1);
      throw new Error(message, { cause: err });
    } finally {
      setCreatingPayment(false);
    }
  }, [checkoutInvoice, payerEmail]);

  const handleCardPaymentError = useCallback((err: unknown) => {
    setCreatingPayment(false);
    setCardNotice('');
    setCardError(getMercadoPagoClientErrorMessage(err));
  }, []);

  const resetCardPaymentAttempt = useCallback(() => {
    setCreatingPayment(false);
    setCardNotice('');
    setCardError('');
    setCardReady(false);
    setCardBrickKey((current) => current + 1);
  }, []);

  const copyPixCode = async () => {
    if (!pixPayment?.qr_code) return;
    await navigator.clipboard.writeText(pixPayment.qr_code);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <header className="border-b border-gray-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <BrandMark className="h-9 w-9" />
            <p className="font-semibold text-gray-50 [font-stretch:112.5%]">Adapter Connect</p>
          </div>
          <Link to="/login" className="btn btn-secondary">Entrar no painel</Link>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div className="lg:pt-6">
            <h1 className="max-w-2xl text-4xl font-semibold leading-[1.1] text-gray-50 [font-stretch:118%] md:text-5xl">
              Cada cliente do WhatsApp respondido e encaminhado ao vendedor certo.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-gray-300">
              Para lojas de motos e celulares: conversas, funil de vendas, rodízio entre vendedores e registro de vendas no mesmo painel.
            </p>
            {/* O caminho de um lead e uma sequencia real: por isso a numeracao. */}
            <ol className="mt-10 max-w-xl space-y-5 border-l border-gray-700 pl-6">
              {LEAD_PATH.map((step, index) => (
                <li key={step.title} className="relative">
                  <span className="absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full border border-gray-600 bg-gray-900 text-xs tabular-nums text-gray-300">
                    {index + 1}
                  </span>
                  <p className="font-medium text-gray-50">{step.title}</p>
                  <p className="text-sm text-gray-400">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
            {!checkoutInvoice ? (
              <form onSubmit={handleSubmit}>
                <h2 className="text-xl font-semibold text-gray-50">Criar a conta da loja</h2>
                <p className="mt-1 text-sm text-gray-400">Escolha o plano, cadastre a loja e o administrador. O acesso é liberado assim que o pagamento é confirmado.</p>

                {error && (
                  <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                    {error}
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
                      className="input py-2.5"
                    >
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} - {formatCurrency(plan.price)}/mês
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-300">Nome da loja</label>
                      <input value={companyName} onChange={(event) => handleCompanyNameChange(event.target.value)} required className="input py-2.5" />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-300">Identificador da loja (sem espaços)</label>
                      <input value={companySlug} onChange={(event) => setCompanySlug(normalizeSlug(event.target.value))} required className="input py-2.5" />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-300">Seu nome</label>
                      <input value={adminName} onChange={(event) => setAdminName(event.target.value)} required className="input py-2.5" />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-300">Usuário de acesso</label>
                      <input value={adminUsername} onChange={(event) => setAdminUsername(event.target.value.toLowerCase())} required className="input py-2.5" />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">E-mail (pagamento e recuperação de senha)</label>
                    <input type="email" value={payerEmail} onChange={(event) => setPayerEmail(event.target.value)} required className="input py-2.5" />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">Senha</label>
                    <input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} minLength={8} maxLength={128} required className="input py-2.5" />
                  </div>

                  <button type="submit" disabled={submitting || !selectedPlanId} className="rounded-lg bg-indigo-500 px-4 py-3 font-semibold text-gray-950 hover:bg-indigo-400 disabled:opacity-50">
                    {submitting ? 'Criando conta...' : 'Continuar para pagamento'}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <h3 className="text-xl font-bold">Pagamento seguro</h3>
                <div className="mt-3 rounded-lg border border-gray-700 bg-gray-800 p-4 text-sm text-gray-300">
                  <div className="flex justify-between">
                    <span>Plano</span>
                    <strong className="text-gray-50">{checkoutInvoice.plan?.name || selectedPlan?.name}</strong>
                  </div>
                  <div className="mt-2 flex justify-between">
                    <span>Total</span>
                    <strong className="text-gray-50">{formatCurrency(checkoutInvoice.amount)}</strong>
                  </div>
                </div>

                {paymentApproved ? (
                  <div className="mt-5 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-green-300">
                    Pagamento aprovado. Sua conta foi ativada.
                    <Link to="/login" className="mt-3 block rounded-lg bg-indigo-500 px-4 py-2 text-center font-semibold text-gray-950 hover:bg-indigo-400">
                      Ir para login
                    </Link>
                  </div>
                ) : (
                  <>
                    {error && (
                      <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                        {error}
                      </div>
                    )}

                    <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-gray-800 p-1">
                      <button type="button" onClick={() => setPaymentMethod('pix')} className={`rounded-md px-3 py-2 text-sm font-semibold ${paymentMethod === 'pix' ? 'bg-indigo-500 text-gray-950' : 'text-gray-300 hover:bg-gray-700'}`}>
                        Pix
                      </button>
                      <button type="button" onClick={() => setPaymentMethod('card')} className={`rounded-md px-3 py-2 text-sm font-semibold ${paymentMethod === 'card' ? 'bg-indigo-500 text-gray-950' : 'text-gray-300 hover:bg-gray-700'}`}>
                        Credito ou Debito
                      </button>
                    </div>

                    {paymentMethod === 'pix' && (
                      <div className="mt-5 space-y-4">
                        <button type="button" onClick={createPixPayment} disabled={creatingPayment || !checkoutConfig?.pix_enabled} className="w-full rounded-lg bg-indigo-500 px-4 py-3 font-semibold text-gray-950 hover:bg-indigo-400 disabled:opacity-50">
                          {creatingPayment ? 'Gerando Pix...' : 'Gerar QR Code Pix'}
                        </button>

                        {!checkoutConfig?.pix_enabled && (
                          <p className="text-sm text-red-300">Pagamento indisponível no momento. Tente novamente mais tarde.</p>
                        )}

                        {pixPayment && (
                          <div className="rounded-lg border border-gray-700 bg-gray-800 p-4 text-center">
                            {pixPayment.qr_code_base64 && (
                              <img src={`data:image/png;base64,${pixPayment.qr_code_base64}`} alt="QR Code Pix" className="mx-auto h-56 w-56 rounded-lg bg-white p-2" />
                            )}
                            {pixPayment.qr_code && (
                              <>
                                <textarea readOnly value={pixPayment.qr_code} className="mt-4 h-24 w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-xs text-gray-200" />
                                <button type="button" onClick={copyPixCode} className="mt-3 w-full rounded-lg border border-gray-600 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-gray-700">
                                  Copiar codigo Pix
                                </button>
                              </>
                            )}
                            <p className="mt-3 text-xs text-gray-400">Assim que o pagamento é confirmado, o acesso é liberado automaticamente.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {paymentMethod === 'card' && (
                      <div className="mt-5">
                        {!checkoutConfig?.card_enabled && (
                          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                            Para cartao, configure PLATFORM_MP_PUBLIC_KEY alem do access token.
                          </div>
                        )}
                        {checkoutConfig?.card_enabled && (
                          <>
                            {(!cardReady || !cardSdkReady) && <p className="mb-3 text-sm text-gray-400">Carregando formulario seguro do Mercado Pago...</p>}
                            <div className={`rounded-lg border border-gray-700 bg-white p-3 text-gray-900 ${creatingPayment ? 'pointer-events-none opacity-70' : ''}`}>
                              {cardSdkReady && cardPaymentInitialization && (
                                <CardPayment
                                  key={`${checkoutInvoice.id}-${cardBrickKey}`}
                                  initialization={cardPaymentInitialization}
                                  customization={cardPaymentCustomization}
                                  locale="pt-BR"
                                  onReady={handleCardPaymentReady}
                                  onError={handleCardPaymentError}
                                  onSubmit={handleCardPaymentSubmit}
                                />
                              )}
                            </div>
                            {cardNotice && (
                              <p className="mt-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200">
                                {cardNotice}
                              </p>
                            )}
                            {cardError && (
                              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                <p>{cardError}</p>
                                <button
                                  type="button"
                                  onClick={resetCardPaymentAttempt}
                                  className="mt-2 rounded-md border border-red-400/40 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/10"
                                >
                                  Tentar novamente
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-14">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-gray-50">Planos</h2>
              <p className="mt-1 text-gray-400">Assinatura mensal. Sem fidelidade.</p>
            </div>
            {selectedPlan && <span className="hidden text-sm text-indigo-300 sm:inline">Selecionado: {selectedPlan.name}</span>}
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan) => (
              <button
                type="button"
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`rounded-lg border p-5 text-left transition ${
                  selectedPlanId === plan.id ? 'border-indigo-500 bg-indigo-500/[0.06]' : 'border-gray-700 bg-gray-800 hover:border-gray-500'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-50">{plan.name}</h3>
                    <p className="mt-2 min-h-12 text-sm text-gray-400">{planDescriptions[plan.name] || 'Plano para uso mensal do Adapter Connect.'}</p>
                  </div>
                  <span className="rounded-md bg-gray-800 px-2 py-1 text-xs text-gray-300">{plan.max_products} produtos</span>
                </div>
                <p className="mt-5 text-3xl font-semibold tabular-nums text-gray-50 [font-stretch:112.5%]">{formatCurrency(plan.price)}</p>
                <p className="text-sm text-gray-500">por mês</p>
                <ul className="mt-5 space-y-2 text-sm text-gray-300">
                  <li>{plan.max_instances} {plan.max_instances === 1 ? 'número' : 'números'} de WhatsApp</li>
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
