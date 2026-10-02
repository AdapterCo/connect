const { prisma } = require('../config/database');
const mercadopago = require('mercadopago');
const Log = require('../models/Log');
const { encrypt } = require('../utils/crypto');

// Erro de regra de negocio cuja mensagem pode ser exibida ao usuario.
class BillingError extends Error {}
const { nextMonth } = require('../utils/billingDate');
async function createPaymentAttempt(charge, type, method, payload, paymentData) {
  const fingerprint = require('crypto').createHash('sha256').update(String(payload.token || method)).digest('hex');
  const key = charge.id + '-' + method + '-' + fingerprint;
  const attempt = await prisma.paymentAttempt.upsert({ where: { idempotency_key: key }, update: {}, create: { charge_id: charge.id, charge_type: type, idempotency_key: key } });
  if (attempt.mp_payment_id) return fetchPayment(attempt.mp_payment_id);
  const response = await new mercadopago.Payment(createMercadoPagoClient()).create({ body: paymentData, requestOptions: { idempotencyKey: key } });
  await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { mp_payment_id: String(response.id), status: response.status || 'pending' } });
  return response;
}
function validatePayment(payload) {
  if (!payload || !['pix', 'card'].includes(payload.method)) throw new BillingError('Forma de pagamento invalida.');
  if (payload.method !== 'card') return;
  const installments = payload.installments ?? 1;
  if (!['number', 'string'].includes(typeof installments) || !/^[0-9]{1,2}$/.test(String(installments)) || Number(installments) < 1 || Number(installments) > 12 || typeof payload.token !== 'string' || !payload.token.trim() || payload.token.length > 512 || typeof payload.payment_method_id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(payload.payment_method_id)) throw new BillingError('Dados do cartao invalidos.');
  if (payload.issuer_id !== undefined && (!['number', 'string'].includes(typeof payload.issuer_id) || !/^[0-9]{1,20}$/.test(String(payload.issuer_id)))) throw new BillingError('Emissor invalido.');
  if (payload.identification_type !== undefined || payload.identification_number !== undefined) {
    if (!['CPF', 'CNPJ'].includes(payload.identification_type) || typeof payload.identification_number !== 'string' || !/^[0-9.\-/]{11,18}$/.test(payload.identification_number)) throw new BillingError('Documento do pagador invalido.');
    const digits = payload.identification_number.replace(/\D/g, '');
    if (digits.length !== (payload.identification_type === 'CPF' ? 11 : 14)) throw new BillingError('Documento do pagador invalido.');
  }
}

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

function getPlatformAccessToken() {
  return process.env.PLATFORM_MP_ACCESS_TOKEN || '';
}

function getPlatformPublicKey() {
  return process.env.PLATFORM_MP_PUBLIC_KEY || '';
}

function createMercadoPagoClient() {
  const accessToken = getPlatformAccessToken();
  if (!accessToken) {
    throw new Error('Mercado Pago da plataforma nao configurado. Defina PLATFORM_MP_ACCESS_TOKEN.');
  }

  return new mercadopago.MercadoPagoConfig({ accessToken, options: { timeout: 15000 } });
}

async function listActivePlans() {
  return prisma.plan.findMany({
    where: {
      is_active: true,
      price: { gt: 0 }
    },
    orderBy: { price: 'asc' }
  });
}

async function createSubscription(companyId, planId) {
  return require('./salesRotationService').withCompanyLock(companyId, async tx => {
    const company = await tx.company.findUnique({ where: { id: companyId } });
    const plan = await tx.plan.findUnique({ where: { id: planId } });
    if (!company || !plan?.is_active || Number(plan.price) <= 0) throw new BillingError('Empresa ou plano indisponivel.');
    if (await tx.subscription.findFirst({ where: { company_id: companyId, status: { in: ['active', 'pending', 'past_due'] } } })) throw new BillingError('Empresa ja possui assinatura.');
    const now = new Date(), periodEnd = nextMonth(now);
    const subscription = await tx.subscription.create({ data: { company_id: companyId, plan_id: planId, status: 'pending', current_period_start: now, current_period_end: periodEnd } });
    const invoice = await tx.invoice.create({ data: { company_id: companyId, subscription_id: subscription.id, amount: plan.price, status: 'pending', due_date: now } });
    return { subscription, invoice, mp_payment_url: null };
  });
}

async function createInvoice(companyId, subscriptionId, amount, dueDate) {
  try {
    const invoice = await prisma.invoice.create({
      data: {
        company_id: companyId,
        subscription_id: subscriptionId,
        amount,
        status: 'pending',
        due_date: dueDate
      }
    });

    return invoice;
  } catch (error) {
    console.error('Erro ao criar fatura:', error);
    throw error;
  }
}

async function getCheckoutConfig() {
  return {
    public_key: getPlatformPublicKey(),
    pix_enabled: !!getPlatformAccessToken(),
    card_enabled: !!getPlatformAccessToken() && !!getPlatformPublicKey()
  };
}

async function getInvoiceCheckout(invoiceId) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      company: { select: { id: true, name: true, slug: true, is_active: true } },
      subscription: { include: { plan: true } }
    }
  });

  if (!invoice) {
    const signupCheckout = await getSignupCheckout(invoiceId);
    if (signupCheckout) {
      return {
        id: signupCheckout.id,
        amount: signupCheckout.amount,
        status: signupCheckout.status,
        mp_payment_id: signupCheckout.mp_payment_id,
        mp_payment_url: signupCheckout.mp_payment_url,
        company: {
          id: signupCheckout.company_id,
          name: signupCheckout.company_name,
          slug: signupCheckout.company_slug,
          is_active: signupCheckout.status === 'paid'
        },
        subscription: { plan: signupCheckout.plan }
      };
    }

    throw new BillingError('Fatura nao encontrada.');
  }

  return invoice;
}

function buildPaymentPayload(invoice, paymentResponse = null) {
  const transactionData = paymentResponse?.point_of_interaction?.transaction_data || {};
  return {
    invoice_id: invoice.id,
    amount: invoice.amount,
    status: invoice.status,
    mp_payment_id: invoice.mp_payment_id,
    mp_payment_url: invoice.mp_payment_url,
    qr_code: transactionData.qr_code || null,
    qr_code_base64: transactionData.qr_code_base64 || null,
    ticket_url: transactionData.ticket_url || invoice.mp_payment_url || null,
    payment_status: paymentResponse?.status || null,
    payment_status_detail: paymentResponse?.status_detail || null
  };
}

function buildSignupPaymentPayload(checkout, paymentResponse = null) {
  const transactionData = paymentResponse?.point_of_interaction?.transaction_data || {};
  return {
    invoice_id: checkout.id,
    amount: checkout.amount,
    status: checkout.status,
    mp_payment_id: checkout.mp_payment_id,
    mp_payment_url: checkout.mp_payment_url,
    qr_code: transactionData.qr_code || null,
    qr_code_base64: transactionData.qr_code_base64 || null,
    ticket_url: transactionData.ticket_url || checkout.mp_payment_url || null,
    payment_status: paymentResponse?.status || null,
    payment_status_detail: paymentResponse?.status_detail || null
  };
}

async function getSignupCheckout(checkoutId) {
  return prisma.signupCheckout.findUnique({
    where: { id: checkoutId },
    include: { plan: true }
  });
}

async function activateSignupCheckout(checkoutId, approvedPaymentId) {
  const checkout = await prisma.signupCheckout.findUnique({
    where: { id: checkoutId },
    include: { plan: true }
  });

  if (!checkout || checkout.status === 'paid') {
    return checkout;
  }

  const existingCompany = await prisma.company.findUnique({
    where: { slug: checkout.company_slug }
  });
  if (existingCompany) {
    throw new BillingError('Este slug de empresa ja esta em uso.');
  }

  const existingUser = await prisma.user.findUnique({
    where: { username: checkout.admin_username }
  });
  if (existingUser) {
    throw new BillingError('Este nome de usuario ja esta em uso.');
  }

  // O e-mail do pagador vira o e-mail de recuperacao do admin, exceto o endereco
  // ficticio gerado quando o cadastro nao informa e-mail ou um ja usado por outra conta.
  const payerEmail = String(checkout.payer_email || '').trim().toLowerCase();
  const generatedEmail = `${checkout.admin_username}@${checkout.company_slug}.com.br`;
  const adminEmail = EMAIL_PATTERN.test(payerEmail) && payerEmail !== generatedEmail &&
    !await prisma.user.findFirst({ where: { email: payerEmail }, select: { id: true } })
    ? payerEmail : null;

  const suffix = require('crypto').randomBytes(4).toString('hex');
  const nowMs = Date.now();
  const companyId = `comp_${nowMs}_${suffix}`;
  const userId = `usr_${nowMs}_${suffix}`;
  const instanceId = `inst_${nowMs}_${suffix}`;
  const now = new Date();
  const periodEnd = nextMonth(now);

  const activated = await prisma.$transaction(async (tx) => {
    // Reivindica o checkout primeiro: consultas de status simultaneas nao podem
    // criar a empresa duas vezes.
    const claimed = await tx.signupCheckout.updateMany({
      where: { id: checkout.id, status: { not: 'paid' } },
      data: {
        status: 'paid',
        mp_payment_id: approvedPaymentId || checkout.mp_payment_id,
        paid_at: now,
        company_id: companyId,
        // [LGPD/Segurança] Apagar dados sensíveis após ativação — senha e e-mail não devem
        // permanecer no registro após o tenant ser criado.
        admin_password: '',
        payer_email: ''
      }
    });
    if (!claimed.count) return false;

    await tx.company.create({
      data: {
        id: companyId,
        name: checkout.company_name,
        slug: checkout.company_slug,
        plan: checkout.plan.name,
        plan_id: checkout.plan.id,
        max_instances: checkout.plan.max_instances,
        max_users: checkout.plan.max_users,
        max_products: checkout.plan.max_products,
        mp_enabled: false,
        is_active: true,
        expires_at: periodEnd
      }
    });

    await tx.settings.create({
      data: {
        company_id: companyId,
        ai_enabled: false,
        ai_provider: 'mock',
        gemini_key: encrypt(''),
        openai_key: encrypt(''),
        grok_key: encrypt(''),
        gemini_model: 'gemini-2.5-flash',
        openai_model: 'gpt-4o-mini',
        grok_model: 'llama-3.3-70b-versatile',
        system_prompt: 'Voce e um assistente virtual de atendimento. Seja cordial e ajude o cliente.'
      }
    });

    await tx.user.create({
      data: {
        id: userId,
        name: checkout.admin_name,
        username: checkout.admin_username,
        email: adminEmail,
        password: checkout.admin_password,
        role: 'admin',
        status: 'offline',
        company_id: companyId
      }
    });

    await tx.instance.create({
      data: {
        id: instanceId,
        name: 'Numero Principal',
        status: 'disconnected',
        company_id: companyId
      }
    });

    const subscription = await tx.subscription.create({
      data: {
        company_id: companyId,
        plan_id: checkout.plan.id,
        status: 'active',
        current_period_start: now,
        current_period_end: periodEnd
      }
    });

    await tx.invoice.create({
      data: {
        company_id: companyId,
        subscription_id: subscription.id,
        amount: checkout.amount,
        status: 'paid',
        mp_payment_id: approvedPaymentId || checkout.mp_payment_id,
        mp_payment_url: checkout.mp_payment_url,
        due_date: checkout.due_date,
        paid_at: now
      }
    });

    return true;
  });

  if (activated) {
    await Log.add(`Empresa ${checkout.company_name} ativada apos pagamento aprovado.`, companyId);
  }

  return prisma.signupCheckout.findUnique({
    where: { id: checkout.id },
    include: { plan: true }
  });
}

async function createCheckoutPayment(invoiceId, payload) {
  validatePayment(payload);
  const signupCheckout = await getSignupCheckout(invoiceId);
  if (signupCheckout) {
    if (signupCheckout.status === 'paid') {
      return buildSignupPaymentPayload(signupCheckout);
    }

    const method = payload.method;
    const payerEmail = String(payload.payer_email || signupCheckout.payer_email || '').trim().toLowerCase();

    if (!EMAIL_PATTERN.test(payerEmail)) {
      throw new BillingError('E-mail do pagador e obrigatorio.');
    }


    const paymentData = {
      transaction_amount: Number(signupCheckout.amount),
      description: `Assinatura ${signupCheckout.plan?.name || 'Adapter Connect'} - ${signupCheckout.company_name}`,
      external_reference: signupCheckout.id,
      payer: { email: payerEmail }
    };

    if (method === 'pix') {
      paymentData.payment_method_id = 'pix';
    } else if (method === 'card') {
      if (!payload.token || !payload.payment_method_id) {
        throw new BillingError('Dados do cartao incompletos.');
      }

      paymentData.token = payload.token;
      paymentData.payment_method_id = payload.payment_method_id;
      paymentData.installments = Number(payload.installments || 1);
      if (payload.issuer_id) paymentData.issuer_id = String(payload.issuer_id);
      if (payload.identification_type && payload.identification_number) {
        paymentData.payer.identification = {
          type: payload.identification_type,
          number: String(payload.identification_number).replace(/\D/g, '')
        };
      }
    } else {
      throw new BillingError('Forma de pagamento invalida.');
    }

    const response = await createPaymentAttempt(signupCheckout, 'signup', method, payload, paymentData);

    const mpPaymentUrl = response.point_of_interaction?.transaction_data?.ticket_url || null;
    await prisma.signupCheckout.updateMany({
      where: { id: signupCheckout.id, status: { not: 'paid' } },
      data: {
        mp_payment_id: String(response.id),
        mp_payment_url: mpPaymentUrl,
        status: response.status === 'approved' ? 'processing' : response.status === 'rejected' ? 'failed' : 'pending'
      },
    });
    let updatedCheckout = await getSignupCheckout(signupCheckout.id);

    if (response.status === 'approved') {
      await confirmPayment(response.id);
      updatedCheckout = await getSignupCheckout(updatedCheckout.id);
    }

    return buildSignupPaymentPayload(updatedCheckout, response);
  }

  const invoice = await getInvoiceCheckout(invoiceId);

  if (invoice.status === 'paid') {
    return buildPaymentPayload(invoice);
  }

  const method = payload.method;
  const payerEmail = String(payload.payer_email || '').trim().toLowerCase();

  if (!EMAIL_PATTERN.test(payerEmail)) {
    throw new BillingError('E-mail do pagador e obrigatorio.');
  }


  const paymentData = {
    transaction_amount: Number(invoice.amount),
    description: `Assinatura ${invoice.subscription?.plan?.name || 'Adapter Connect'} - ${invoice.company.name}`,
    external_reference: invoice.id,
    payer: { email: payerEmail }
  };

  if (method === 'pix') {
    paymentData.payment_method_id = 'pix';
  } else if (method === 'card') {
    if (!payload.token || !payload.payment_method_id) {
      throw new BillingError('Dados do cartao incompletos.');
    }

    paymentData.token = payload.token;
    paymentData.payment_method_id = payload.payment_method_id;
    paymentData.installments = Number(payload.installments || 1);
    if (payload.issuer_id) paymentData.issuer_id = String(payload.issuer_id);
    if (payload.identification_type && payload.identification_number) {
      paymentData.payer.identification = {
        type: payload.identification_type,
        number: String(payload.identification_number).replace(/\D/g, '')
      };
    }
  } else {
    throw new BillingError('Forma de pagamento invalida.');
  }

  const response = await createPaymentAttempt(invoice, 'invoice', method, payload, paymentData);

  const mpPaymentUrl = response.point_of_interaction?.transaction_data?.ticket_url || null;
  // A fatura so vira 'paid' em confirmPayment, apos consulta a API do MP.
  await prisma.invoice.updateMany({
    where: { id: invoice.id, status: { not: 'paid' } },
    data: {
      mp_payment_id: String(response.id),
      mp_payment_url: mpPaymentUrl,
      status: 'pending'
    }
  });

  let updatedInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
  if (response.status === 'approved') {
    await confirmPayment(response.id);
    updatedInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
  }

  return buildPaymentPayload(updatedInvoice, response);
}

async function getCheckoutStatus(invoiceId) {
  const signupCheckout = await getSignupCheckout(invoiceId);
  if (signupCheckout) {
    if (signupCheckout.mp_payment_id && signupCheckout.status !== 'paid') {
      await confirmPaymentSafely(signupCheckout.mp_payment_id);
    }

    const refreshed = await getSignupCheckout(invoiceId);
    return buildSignupPaymentPayload(refreshed);
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId }
  });

  if (!invoice) {
    throw new BillingError('Fatura nao encontrada.');
  }

  if (invoice.mp_payment_id && invoice.status !== 'paid') {
    await confirmPaymentSafely(invoice.mp_payment_id);
  }

  const refreshed = await prisma.invoice.findUnique({
    where: { id: invoiceId }
  });

  return buildPaymentPayload(refreshed);
}

async function checkExpiredSubscriptions() {
  try {
    const now = new Date();

    const expiredSubscriptions = await prisma.subscription.findMany({
      where: {
        status: { in: ['active', 'cancelled'] },
        current_period_end: {
          lt: now
        }
      },
      include: {
        company: true,
        plan: true
      }
    });

    for (const subscription of expiredSubscriptions) {
      const suspended = await require('./salesRotationService').withCompanyLock(subscription.company_id, async tx => {
        const claimed = await tx.subscription.updateMany({
          where: { id: subscription.id, status: { in: ['active', 'cancelled'] }, current_period_end: { lt: now } },
          data: { status: subscription.status === 'cancelled' ? 'expired' : 'past_due' }
        });
        if (!claimed.count) return false;
        const company = await tx.company.findUnique({ where: { id: subscription.company_id } });
        if (company?.expires_at && new Date(company.expires_at) > now) return false;
        await tx.company.update({ where: { id: subscription.company_id }, data: { is_active: false } });
        return true;
      });
      if (!suspended) continue;
      require('../config/socket').disconnectCompany(subscription.company_id);
      const whatsapp = require('./whatsappService');
      for (const [id, connection] of Object.entries(whatsapp.getActiveConnections())) if (connection.companyId === subscription.company_id) await whatsapp.stopWhatsAppInstance(id, false);
      if (subscription.status !== 'cancelled') await ensureRenewalInvoice(subscription.company_id);

      await Log.add(
        `Assinatura expirada para empresa ${subscription.company.name} - Plano ${subscription.plan.name}`,
        subscription.company_id
      );

      console.log(`Assinatura expirada: ${subscription.company.name}`);
    }

    return expiredSubscriptions.length;
  } catch (error) {
    console.error('Erro ao verificar assinaturas expiradas:', error);
    throw error;
  }
}

async function ensureRenewalInvoice(companyId) {
  return require('./salesRotationService').withCompanyLock(companyId, async tx => {
    const subscription = await tx.subscription.findFirst({ where: { company_id: companyId, status: { in: ['active', 'past_due', 'pending'] } }, include: { plan: true }, orderBy: { created_at: 'desc' } });
    if (!subscription) return null;
    const existing = await tx.invoice.findFirst({ where: { subscription_id: subscription.id, status: { in: ['pending', 'failed'] } } });
    if (existing) return existing;
    if (new Date(subscription.current_period_end).getTime() > Date.now() + 7 * 86400000) return null;
    return tx.invoice.create({ data: { company_id: companyId, subscription_id: subscription.id, amount: subscription.plan.price, status: 'pending', due_date: subscription.current_period_end } });
  });
}

async function reconcilePayments() {
  if (!getPlatformAccessToken()) return;
  const attempts = await prisma.paymentAttempt.findMany({
    where: { mp_payment_id: { not: null }, OR: [
      { status: { in: ['pending', 'in_process', 'authorized'] }, OR: [{ checked_at: null }, { checked_at: { lt: new Date(Date.now() - 60000) } }] },
      { status: 'approved', OR: [{ checked_at: null }, { checked_at: { lt: new Date(Date.now() - 86400000) } }] }
    ] }, orderBy: { checked_at: { sort: 'asc', nulls: 'first' } }, take: 50
  });
  for (const attempt of attempts) {
    try {
      await confirmPayment(attempt.mp_payment_id);
      await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { checked_at: new Date() } });
    } catch (error) { console.error('[Payment reconciliation]', error.code || error.name); }
  }
}

// Consulta o pagamento diretamente na API do Mercado Pago. O status nunca vem
// do cliente: esta e a unica fonte de verdade para liberar acesso.
async function fetchPayment(paymentId) {
  const accessToken = getPlatformAccessToken();
  if (!accessToken) {
    throw new Error('Mercado Pago da plataforma nao configurado. Defina PLATFORM_MP_ACCESS_TOKEN.');
  }

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    throw new Error(`Falha ao consultar pagamento no Mercado Pago (HTTP ${response.status}).`);
  }
  return response.json();
}

// O pagamento precisa ter sido criado para esta cobranca e com o valor dela.
function matchesCharge(payment, reference, amount) {
  return String(payment.external_reference || '') === String(reference)
    && Math.round(Number(payment.transaction_amount) * 100) === Math.round(Number(amount) * 100);
}

// Usado pelo polling: uma falha temporaria na API do MP mantem o status atual.
async function confirmPaymentSafely(paymentId) {
  try {
    await confirmPayment(paymentId);
  } catch (error) {
    console.error('Erro ao confirmar pagamento:', error.message);
  }
}

async function confirmPayment(paymentId) {
  const normalizedPaymentId = String(paymentId);
  const payment = await fetchPayment(normalizedPaymentId);
  const status = payment.status;
  const attempt = await prisma.paymentAttempt.findFirst({ where: { mp_payment_id: normalizedPaymentId } });
  await prisma.paymentAttempt.updateMany({ where: { mp_payment_id: normalizedPaymentId }, data: { status, checked_at: new Date() } });
  const signupCheckout = await prisma.signupCheckout.findFirst({
    where: attempt?.charge_type === 'signup' ? { id: attempt.charge_id } : { mp_payment_id: normalizedPaymentId },
    include: { plan: true }
  });

  if (signupCheckout) {
    if (!matchesCharge(payment, signupCheckout.id, signupCheckout.amount)) {
      console.error(`Pagamento ${normalizedPaymentId} nao corresponde ao checkout ${signupCheckout.id}.`);
      return;
    }
    if (status === 'approved') {
      await activateSignupCheckout(signupCheckout.id, normalizedPaymentId);
    } else if (status === 'rejected') {
      await prisma.signupCheckout.updateMany({
        where: { id: signupCheckout.id, status: { not: 'paid' } },
        data: { status: 'failed' }
      });
    }
    return;
  }

  const invoice = await prisma.invoice.findFirst({
    where: attempt?.charge_type === 'invoice' ? { id: attempt.charge_id } : { mp_payment_id: normalizedPaymentId }
  });

  if (!invoice) {
    console.log(`Fatura não encontrada para pagamento ${normalizedPaymentId}`);
    return;
  }

  if (!matchesCharge(payment, invoice.id, invoice.amount)) {
    console.error(`Pagamento ${normalizedPaymentId} nao corresponde a fatura ${invoice.id}.`);
    return;
  }

  if (['refunded', 'charged_back'].includes(status) && attempt?.status !== status) {
    await Log.add('Revisao financeira necessaria: pagamento ' + normalizedPaymentId + ' da fatura ' + invoice.id + ' com status ' + status + '.', invoice.company_id);
  }
  if (status === 'approved') {
    const newPeriodEnd = await require('./salesRotationService').withCompanyLock(invoice.company_id, async (tx) => {
      // Idempotente: so a primeira confirmacao marca a fatura e renova o periodo.
      const claimed = await tx.invoice.updateMany({
        where: { id: invoice.id, status: { not: 'paid' } },
        data: { status: 'paid', paid_at: new Date() }
      });
      if (!claimed.count || !invoice.subscription_id) return null;

      const subscription = await tx.subscription.findUnique({
        where: { id: invoice.subscription_id },
        include: { plan: true }
      });
      if (!subscription) return null;

      const now = new Date();
      const company = await tx.company.findUnique({ where: { id: subscription.company_id } });
      const prepaidEnd = ['active', 'cancelled'].includes(subscription.status) ? new Date(subscription.current_period_end).getTime() : 0;
      const companyEnd = company?.is_active && company.expires_at ? new Date(company.expires_at).getTime() : 0;
      const base = new Date(Math.max(now.getTime(), prepaidEnd, companyEnd));
      const periodEnd = nextMonth(base);

      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'active',
          current_period_start: now,
          current_period_end: periodEnd
        }
      });

      await tx.company.update({
        where: { id: subscription.company_id },
        data: {
          is_active: true,
          plan_id: subscription.plan_id,
          plan: subscription.plan.name,
          max_instances: subscription.plan.max_instances,
          max_users: subscription.plan.max_users,
          max_products: subscription.plan.max_products,
          expires_at: periodEnd
        }
      });

      return periodEnd;
    });

    if (newPeriodEnd) {
      await Log.add(
        `Pagamento aprovado - Fatura renovada até ${newPeriodEnd.toLocaleDateString('pt-BR')}`,
        invoice.company_id
      );
    }
  } else if (status === 'rejected') {
    const rejected = await prisma.invoice.updateMany({
      where: { id: invoice.id, status: { not: 'paid' } },
      data: { status: 'failed' }
    });

    if (rejected.count) {
      await Log.add(
        `Pagamento rejeitado - Fatura ${invoice.id}`,
        invoice.company_id
      );
    }
  }
}

async function getCompanyInvoices(companyId) {
  try {
    await ensureRenewalInvoice(companyId);
    const invoices = await prisma.invoice.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: 'desc' },
      include: {
        subscription: {
          include: { plan: true }
        }
      }
    });

    return invoices;
  } catch (error) {
    console.error('Erro ao buscar faturas:', error);
    throw error;
  }
}

async function cancelSubscription(companyId) {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: {
        company_id: companyId,
        status: 'active'
      }
    });

    if (!subscription) {
      throw new BillingError('Nenhuma assinatura ativa encontrada');
    }

    const updated = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'cancelled' }
    });

    await Log.add('Assinatura cancelada', companyId);

    return updated;
  } catch (error) {
    console.error('Erro ao cancelar assinatura:', error);
    throw error;
  }
}

module.exports = {
  BillingError,
  listActivePlans,
  getCheckoutConfig,
  getInvoiceCheckout,
  createCheckoutPayment,
  getCheckoutStatus,
  createSubscription,
  createInvoice,
  checkExpiredSubscriptions,
  confirmPayment,
  getCompanyInvoices,
  cancelSubscription,
  ensureRenewalInvoice,
  reconcilePayments
};
