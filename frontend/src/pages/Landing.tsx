import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

declare global {
  interface Window {
    MercadoPago?: any;
  }
}

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

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function loadMercadoPagoSdk() {
  if (window.MercadoPago) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="https://sdk.mercadopago.com/js/v2"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Erro ao carregar SDK do Mercado Pago.')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Erro ao carregar SDK do Mercado Pago.'));
    document.body.appendChild(script);
  });
}

function getMercadoPagoClientErrorMessage(err: any) {
  const message = typeof err?.message === 'string' ? err.message : '';
  const serialized = (() => {
    try {
      return JSON.stringify(err);
    } catch {
      return '';
    }
  })();
  const raw = `${message} ${serialized}`.toLowerCase();

  if (raw.includes('public key not found') || raw.includes('"status":404') || raw.includes('status: 404')) {
    return 'A chave publica do Mercado Pago nao foi encontrada. Verifique a variavel PLATFORM_MP_PUBLIC_KEY na VPS e publique novamente.';
  }

  if (raw.includes('form could not be submitted')) {
    return 'Nao foi possivel validar os dados do cartao. Confira as informacoes e tente novamente.';
  }

  if (raw.includes('failed to fetch') || raw.includes('cors') || raw.includes('err_failed')) {
    return 'Nao foi possivel comunicar com o Mercado Pago para validar o cartao. Tente novamente ou use Pix.';
  }

  return message || 'Erro ao carregar checkout de cartao.';
}

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
  const [cardNotice, setCardNotice] = useState('');
  const [cardError, setCardError] = useState('');
  const cardFormRef = useRef<any>(null);
  const cardPaymentInProgressRef = useRef(false);
  const cardClickFallbackTimerRef = useRef<number | null>(null);

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
      })
      .catch(() => setError('Nao foi possivel carregar os planos e configuracoes de pagamento.'))
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
    if (paymentMethod !== 'card') return;

    const handleMercadoPagoFailure = (event: PromiseRejectionEvent | ErrorEvent) => {
      if (!creatingPayment && !cardNotice) return;

      const reason = 'reason' in event ? event.reason : event.error || event.message;
      const message = getMercadoPagoClientErrorMessage(reason);
      setCardNotice('');
      setCardError(message || 'Nao foi possivel realizar a cobranca. Tente novamente ou use Pix.');
      setCreatingPayment(false);
      cardPaymentInProgressRef.current = false;
      if (cardClickFallbackTimerRef.current) {
        window.clearTimeout(cardClickFallbackTimerRef.current);
        cardClickFallbackTimerRef.current = null;
      }
    };

    window.addEventListener('unhandledrejection', handleMercadoPagoFailure);
    window.addEventListener('error', handleMercadoPagoFailure);

    return () => {
      window.removeEventListener('unhandledrejection', handleMercadoPagoFailure);
      window.removeEventListener('error', handleMercadoPagoFailure);
    };
  }, [paymentMethod, creatingPayment, cardNotice]);

  useEffect(() => {
    if (!checkoutInvoice || !checkoutConfig?.card_enabled || paymentMethod !== 'card' || cardFormRef.current) return;

    let cancelled = false;
    let mounted = false;
    const invoice = checkoutInvoice;
    const config = checkoutConfig;
    const initialPayerEmail = payerEmail;

    async function setupCardForm() {
      setCardError('');
      setCardNotice('');
      setCardReady(false);

      try {
        await loadMercadoPagoSdk();
        if (cancelled || !window.MercadoPago) return;

        const mp = new window.MercadoPago(config.public_key, { locale: 'pt-BR' });
        cardFormRef.current = mp.cardForm({
          amount: String(invoice.amount),
          iframe: true,
          form: {
            id: 'form-checkout',
            cardNumber: {
              id: 'form-checkout__cardNumber',
              placeholder: 'Numero do cartao'
            },
            expirationDate: {
              id: 'form-checkout__expirationDate',
              placeholder: 'MM/AA'
            },
            securityCode: {
              id: 'form-checkout__securityCode',
              placeholder: 'CVV'
            },
            cardholderName: {
              id: 'form-checkout__cardholderName',
              placeholder: 'Nome impresso no cartao'
            },
            issuer: {
              id: 'form-checkout__issuer',
              placeholder: 'Banco emissor'
            },
            installments: {
              id: 'form-checkout__installments',
              placeholder: 'Parcelas'
            },
            identificationType: {
              id: 'form-checkout__identificationType',
              placeholder: 'Tipo de documento'
            },
            identificationNumber: {
              id: 'form-checkout__identificationNumber',
              placeholder: 'Numero do documento'
            },
            cardholderEmail: {
              id: 'form-checkout__cardholderEmail',
              placeholder: 'E-mail'
            }
          },
          callbacks: {
            onFormMounted: (formError: any) => {
              if (formError) {
                setCardError(getMercadoPagoClientErrorMessage(formError));
                return;
              }
              mounted = true;
              setCardReady(true);
            },
            onSubmit: async (event: Event) => {
              event.preventDefault();
              if (cardPaymentInProgressRef.current) return;

              if (cardClickFallbackTimerRef.current) {
                window.clearTimeout(cardClickFallbackTimerRef.current);
                cardClickFallbackTimerRef.current = null;
              }
              cardPaymentInProgressRef.current = true;
              setCreatingPayment(true);
              setCardNotice('Processando pagamento com seguranca. Aguarde, nao feche esta pagina.');
              setCardError('');

              try {
                const cardData = cardFormRef.current.getCardFormData();
                if (!cardData?.token || !cardData?.paymentMethodId) {
                  setCardNotice('');
                  setCardError('Nao foi possivel validar os dados do cartao. Confira as informacoes e tente novamente.');
                  return;
                }

                const response = await api.post(`/billing/checkout/${invoice.id}/payment`, {
                  method: 'card',
                  payer_email: initialPayerEmail,
                  token: cardData.token,
                  issuer_id: cardData.issuerId,
                  payment_method_id: cardData.paymentMethodId,
                  installments: cardData.installments,
                  identification_type: cardData.identificationType,
                  identification_number: cardData.identificationNumber
                });

                if (response.data.payment.status === 'paid' || response.data.payment.payment_status === 'approved') {
                  setCardNotice('Pagamento aprovado. Ativando sua conta...');
                  setPaymentApproved(true);
                } else {
                  setCardNotice('');
                  setCardError('Nao foi possivel realizar a cobranca. Verifique os dados do cartao ou tente outro metodo de pagamento.');
                }
              } catch (err: any) {
                setCardNotice('');
                setCardError(err.response?.data?.error || getMercadoPagoClientErrorMessage(err) || 'Nao foi possivel realizar a cobranca. Verifique os dados do cartao ou tente outro metodo de pagamento.');
              } finally {
                cardPaymentInProgressRef.current = false;
                setCreatingPayment(false);
              }
            }
          }
        });

        window.setTimeout(() => {
          if (!cancelled && !mounted) {
            setCardError((current) => current || 'O formulario do Mercado Pago demorou para carregar. Verifique a public key e tente novamente.');
          }
        }, 12000);
      } catch (err: any) {
        setCardError(getMercadoPagoClientErrorMessage(err));
      }
    }

    setupCardForm();

    return () => {
      cancelled = true;
      if (cardFormRef.current?.unmount) {
        cardFormRef.current.unmount();
      }
      if (cardClickFallbackTimerRef.current) {
        window.clearTimeout(cardClickFallbackTimerRef.current);
        cardClickFallbackTimerRef.current = null;
      }
      cardFormRef.current = null;
      setCardReady(false);
    };
  }, [checkoutInvoice, checkoutConfig, paymentMethod]);

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

      setCheckoutInvoice({
        id: response.data.invoice.id,
        amount: response.data.invoice.amount,
        status: response.data.invoice.status,
        company: response.data.company,
        plan: selectedPlan
      });
      setPayerEmail(payerEmail || `${adminUsername}@${companySlug}.com.br`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao criar conta.');
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
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao gerar Pix.');
    } finally {
      setCreatingPayment(false);
    }
  };

  const handleCardPaymentClick = () => {
    if (!cardReady || creatingPayment) return;

    setCreatingPayment(true);
    setCardNotice('Processando pagamento com seguranca. Aguarde, nao clique novamente.');
    setCardError('');

    if (cardClickFallbackTimerRef.current) {
      window.clearTimeout(cardClickFallbackTimerRef.current);
    }

    cardClickFallbackTimerRef.current = window.setTimeout(() => {
      if (!cardPaymentInProgressRef.current) {
        setCardNotice('');
        setCardError('Nao foi possivel iniciar a validacao do cartao pelo Mercado Pago. Tente novamente ou use Pix.');
        setCreatingPayment(false);
      }
      cardClickFallbackTimerRef.current = null;
    }, 7000);
  };

  const copyPixCode = async () => {
    if (!pixPayment?.qr_code) return;
    await navigator.clipboard.writeText(pixPayment.qr_code);
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
        <section className="mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-indigo-300">Atendimento, vendas e cobrancas em um painel</p>
            <h2 className="max-w-3xl text-4xl font-bold leading-tight md:text-5xl">
              Organize conversas do WhatsApp, automatize respostas e acompanhe seu funil comercial.
            </h2>
            <p className="mt-5 max-w-2xl text-lg text-gray-300">
              O Adapter Connect centraliza chats, pipeline, atendentes, IA, pedidos, relatorios e recebimentos por Mercado Pago para sua operacao vender e atender melhor.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {['IA para atendimento automatico', 'CRM e kanban de oportunidades', 'Gestao de equipe e limites por plano', 'Checkout Pix, credito e debito'].map((feature) => (
                <div key={feature} className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-200">
                  {feature}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
            {!checkoutInvoice ? (
              <form onSubmit={handleSubmit}>
                <h3 className="text-xl font-bold">Criar conta e ativar plano</h3>
                <p className="mt-1 text-sm text-gray-400">Escolha um plano, cadastre a empresa e pague no checkout seguro.</p>

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
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-indigo-500 focus:outline-none"
                    >
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name} - {formatCurrency(plan.price)}/mes
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
                    <label className="mb-2 block text-sm font-medium text-gray-300">E-mail para pagamento</label>
                    <input type="email" value={payerEmail} onChange={(event) => setPayerEmail(event.target.value)} required className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-indigo-500 focus:outline-none" />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">Senha</label>
                    <input type="password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} minLength={6} required className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white focus:border-indigo-500 focus:outline-none" />
                  </div>

                  <button type="submit" disabled={submitting || !selectedPlanId} className="rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
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
                    <strong className="text-white">{checkoutInvoice.plan?.name || selectedPlan?.name}</strong>
                  </div>
                  <div className="mt-2 flex justify-between">
                    <span>Total</span>
                    <strong className="text-white">{formatCurrency(checkoutInvoice.amount)}</strong>
                  </div>
                </div>

                {paymentApproved ? (
                  <div className="mt-5 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-green-300">
                    Pagamento aprovado. Sua conta foi ativada.
                    <Link to="/login" className="mt-3 block rounded-lg bg-green-600 px-4 py-2 text-center font-semibold text-white hover:bg-green-700">
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
                      <button type="button" onClick={() => setPaymentMethod('pix')} className={`rounded-md px-3 py-2 text-sm font-semibold ${paymentMethod === 'pix' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                        Pix
                      </button>
                      <button type="button" onClick={() => setPaymentMethod('card')} className={`rounded-md px-3 py-2 text-sm font-semibold ${paymentMethod === 'card' ? 'bg-indigo-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                        Credito ou Debito
                      </button>
                    </div>

                    {paymentMethod === 'pix' && (
                      <div className="mt-5 space-y-4">
                        <button type="button" onClick={createPixPayment} disabled={creatingPayment || !checkoutConfig?.pix_enabled} className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
                          {creatingPayment ? 'Gerando Pix...' : 'Gerar QR Code Pix'}
                        </button>

                        {!checkoutConfig?.pix_enabled && (
                          <p className="text-sm text-red-300">Mercado Pago da plataforma nao configurado.</p>
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
                            <p className="mt-3 text-xs text-gray-400">Apos pagar, a plataforma valida automaticamente e libera o login.</p>
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
                            {!cardReady && <p className="mb-3 text-sm text-gray-400">Carregando formulario seguro do Mercado Pago...</p>}
                            <form id="form-checkout" className="grid gap-3 rounded-lg border border-gray-700 bg-gray-800 p-4">
                              <div id="form-checkout__cardNumber" className="h-11 rounded-lg border border-gray-600 bg-white px-3" />
                              <div className="grid grid-cols-2 gap-3">
                                <div id="form-checkout__expirationDate" className="h-11 rounded-lg border border-gray-600 bg-white px-3" />
                                <div id="form-checkout__securityCode" className="h-11 rounded-lg border border-gray-600 bg-white px-3" />
                              </div>
                              <input id="form-checkout__cardholderName" type="text" className="h-11 rounded-lg border border-gray-600 bg-white px-3 text-gray-900" />
                              <input id="form-checkout__cardholderEmail" type="hidden" value={payerEmail} readOnly />
                              <select id="form-checkout__issuer" className="hidden" aria-hidden="true" tabIndex={-1} />
                              <select id="form-checkout__installments" className="hidden" aria-hidden="true" tabIndex={-1} />
                              <select id="form-checkout__identificationType" className="hidden" aria-hidden="true" tabIndex={-1} />
                              <input id="form-checkout__identificationNumber" type="hidden" aria-hidden="true" tabIndex={-1} />
                              <button
                                type="submit"
                                onClick={handleCardPaymentClick}
                                disabled={!cardReady || creatingPayment}
                                className="rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {creatingPayment ? 'Validando cartao...' : 'Pagar com cartao'}
                              </button>
                            </form>
                            {cardNotice && (
                              <p className="mt-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-200">
                                {cardNotice}
                              </p>
                            )}
                            {cardError && (
                              <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                                {cardError}
                              </p>
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
                <p className="mt-5 text-3xl font-bold">{formatCurrency(plan.price)}</p>
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
