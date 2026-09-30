const { prisma } = require('../config/database');
const mercadopago = require('mercadopago');
const Log = require('../models/Log');
const { encrypt } = require('../utils/crypto');

// Erro de regra de negocio cuja mensagem pode ser exibida ao usuario.
class BillingError extends Error {}

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

  return new mercadopago.MercadoPagoConfig({ accessToken });
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
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { plan_relation: true }
    });

    if (!company) {
      throw new BillingError('Empresa não encontrada');
    }

    const plan = await prisma.plan.findUnique({
      where: { id: planId }
    });

    if (!plan || !plan.is_active || plan.price <= 0) {
      throw new BillingError('Plano não encontrado');
    }

    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        company_id: companyId,
        status: { in: ['active', 'pending'] }
      }
    });

    if (existingSubscription) {
      throw new BillingError('Empresa já possui uma assinatura ativa');
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription = await prisma.subscription.create({
      data: {
        company_id: companyId,
        plan_id: planId,
        status: 'pending',
        current_period_start: now,
        current_period_end: periodEnd
      }
    });

    await prisma.company.update({
      where: { id: companyId },
      data: {
        plan_id: planId,
        plan: plan.name,
        max_instances: plan.max_instances,
        max_users: plan.max_users,
        max_products: plan.max_products,
        expires_at: periodEnd,
        is_active: false
      }
    });

    const invoice = await createInvoice(companyId, subscription.id, plan.price, periodEnd);

    await Log.add(`Assinatura pendente criada para empresa ${company.name} - Plano ${plan.name}`, companyId);

    return {
      subscription,
      invoice,
      mp_payment_url: invoice.mp_payment_url
    };
  } catch (error) {
    console.error('Erro ao criar assinatura:', error);
    throw error;
  }
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

async function activateSignupCheckout(checkoutId) {
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
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const activated = await prisma.$transaction(async (tx) => {
    // Reivindica o checkout primeiro: consultas de status simultaneas nao podem
    // criar a empresa duas vezes.
    const claimed = await tx.signupCheckout.updateMany({
      where: { id: checkout.id, status: { not: 'paid' } },
      data: {
        status: 'paid',
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
        mp_payment_id: checkout.mp_payment_id,
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

    const client = createMercadoPagoClient();
    const payment = new mercadopago.Payment(client);

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

    const response = await payment.create({
      body: paymentData,
      requestOptions: {
        idempotencyKey: method === 'card'
          ? `${signupCheckout.id}-${method}-${payload.token?.slice(-8) || ''}`
          : `${signupCheckout.id}-${method}`
      }
    });

    const mpPaymentUrl = response.point_of_interaction?.transaction_data?.ticket_url || null;
    let updatedCheckout = await prisma.signupCheckout.update({
      where: { id: signupCheckout.id },
      data: {
        mp_payment_id: String(response.id),
        mp_payment_url: mpPaymentUrl,
        status: response.status === 'approved' ? 'processing' : response.status === 'rejected' ? 'failed' : 'pending'
      },
      include: { plan: true }
    });

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

  const client = createMercadoPagoClient();
  const payment = new mercadopago.Payment(client);

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

  const response = await payment.create({
    body: paymentData,
    requestOptions: {
      idempotencyKey: method === 'card'
        ? `${invoice.id}-${method}-${payload.token?.slice(-8) || ''}`
        : `${invoice.id}-${method}`
    }
  });

  const mpPaymentUrl = response.point_of_interaction?.transaction_data?.ticket_url || null;
  // A fatura so vira 'paid' em confirmPayment, apos consulta a API do MP.
  let updatedInvoice = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      mp_payment_id: String(response.id),
      mp_payment_url: mpPaymentUrl,
      status: 'pending'
    }
  });

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
        status: 'active',
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
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'past_due' }
      });

      await prisma.company.update({
        where: { id: subscription.company_id },
        data: { is_active: false }
      });

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

// Consulta o pagamento diretamente na API do Mercado Pago. O status nunca vem
// do cliente: esta e a unica fonte de verdade para liberar acesso.
async function fetchPayment(paymentId) {
  const accessToken = getPlatformAccessToken();
  if (!accessToken) {
    throw new Error('Mercado Pago da plataforma nao configurado. Defina PLATFORM_MP_ACCESS_TOKEN.');
  }

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
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
    && Math.abs(Number(payment.transaction_amount) - Number(amount)) < 0.01;
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

  const signupCheckout = await prisma.signupCheckout.findFirst({
    where: { mp_payment_id: normalizedPaymentId },
    include: { plan: true }
  });

  if (signupCheckout) {
    if (!matchesCharge(payment, signupCheckout.id, signupCheckout.amount)) {
      console.error(`Pagamento ${normalizedPaymentId} nao corresponde ao checkout ${signupCheckout.id}.`);
      return;
    }
    if (status === 'approved') {
      await activateSignupCheckout(signupCheckout.id);
    } else if (status === 'rejected') {
      await prisma.signupCheckout.updateMany({
        where: { id: signupCheckout.id, status: { not: 'paid' } },
        data: { status: 'failed' }
      });
    }
    return;
  }

  const invoice = await prisma.invoice.findFirst({
    where: { mp_payment_id: normalizedPaymentId }
  });

  if (!invoice) {
    console.log(`Fatura não encontrada para pagamento ${normalizedPaymentId}`);
    return;
  }

  if (!matchesCharge(payment, invoice.id, invoice.amount)) {
    console.error(`Pagamento ${normalizedPaymentId} nao corresponde a fatura ${invoice.id}.`);
    return;
  }

  if (status === 'approved') {
    const newPeriodEnd = await prisma.$transaction(async (tx) => {
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
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

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

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'cancelled' }
    });

    await Log.add('Assinatura cancelada', companyId);

    return subscription;
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
  cancelSubscription
};
