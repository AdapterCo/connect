const { prisma } = require('../config/database');
const mercadopago = require('mercadopago');
const Log = require('../models/Log');
const { encrypt } = require('../utils/crypto');

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
      throw new Error('Empresa não encontrada');
    }

    const plan = await prisma.plan.findUnique({
      where: { id: planId }
    });

    if (!plan || !plan.is_active || plan.price <= 0) {
      throw new Error('Plano não encontrado');
    }

    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        company_id: companyId,
        status: { in: ['active', 'pending'] }
      }
    });

    if (existingSubscription) {
      throw new Error('Empresa já possui uma assinatura ativa');
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

    throw new Error('Fatura nao encontrada.');
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
    throw new Error('Este slug de empresa ja esta em uso.');
  }

  const existingUser = await prisma.user.findUnique({
    where: { username: checkout.admin_username }
  });
  if (existingUser) {
    throw new Error('Este nome de usuario ja esta em uso.');
  }

  const suffix = Math.random().toString(36).substring(2, 6);
  const nowMs = Date.now();
  const companyId = `comp_${nowMs}_${suffix}`;
  const userId = `usr_${nowMs}_${suffix}`;
  const instanceId = `inst_${nowMs}_${suffix}`;
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.$transaction(async (tx) => {
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
        grok_model: 'grok-4.3',
        system_prompt: 'Voce e um assistente virtual de atendimento. Seja cordial e ajude o cliente.'
      }
    });

    await tx.user.create({
      data: {
        id: userId,
        name: checkout.admin_name,
        username: checkout.admin_username,
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

    await tx.signupCheckout.update({
      where: { id: checkout.id },
      data: {
        status: 'paid',
        paid_at: now,
        company_id: companyId
      }
    });
  });

  await Log.add(`Empresa ${checkout.company_name} ativada apos pagamento aprovado.`, companyId);

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

    if (!payerEmail || !payerEmail.includes('@')) {
      throw new Error('E-mail do pagador e obrigatorio.');
    }

    const client = createMercadoPagoClient();
    const payment = new mercadopago.Payment(client);
    const notificationUrl = `https://${process.env.DOMAIN || 'localhost:3000'}/api/billing/webhook/billing`;

    const paymentData = {
      transaction_amount: Number(signupCheckout.amount),
      description: `Assinatura ${signupCheckout.plan?.name || 'Adapter Connect'} - ${signupCheckout.company_name}`,
      external_reference: signupCheckout.id,
      notification_url: notificationUrl,
      payer: { email: payerEmail }
    };

    if (method === 'pix') {
      paymentData.payment_method_id = 'pix';
    } else if (method === 'card') {
      if (!payload.token || !payload.payment_method_id) {
        throw new Error('Dados do cartao incompletos.');
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
      throw new Error('Forma de pagamento invalida.');
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
      updatedCheckout = await activateSignupCheckout(updatedCheckout.id);
    }

    return buildSignupPaymentPayload(updatedCheckout, response);
  }

  const invoice = await getInvoiceCheckout(invoiceId);

  if (invoice.status === 'paid') {
    return buildPaymentPayload(invoice);
  }

  const method = payload.method;
  const payerEmail = String(payload.payer_email || '').trim().toLowerCase();

  if (!payerEmail || !payerEmail.includes('@')) {
    throw new Error('E-mail do pagador e obrigatorio.');
  }

  const client = createMercadoPagoClient();
  const payment = new mercadopago.Payment(client);
  const notificationUrl = `https://${process.env.DOMAIN || 'localhost:3000'}/api/billing/webhook/billing`;

  const paymentData = {
    transaction_amount: Number(invoice.amount),
    description: `Assinatura ${invoice.subscription?.plan?.name || 'Adapter Connect'} - ${invoice.company.name}`,
    external_reference: invoice.id,
    notification_url: notificationUrl,
    payer: { email: payerEmail }
  };

  if (method === 'pix') {
    paymentData.payment_method_id = 'pix';
  } else if (method === 'card') {
    if (!payload.token || !payload.payment_method_id) {
      throw new Error('Dados do cartao incompletos.');
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
    throw new Error('Forma de pagamento invalida.');
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
  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      mp_payment_id: String(response.id),
      mp_payment_url: mpPaymentUrl,
      status: response.status === 'approved' ? 'paid' : 'pending',
      paid_at: response.status === 'approved' ? new Date() : null
    }
  });

  if (response.status === 'approved') {
    await processPaymentWebhook(response.id, response.status);
  }

  return buildPaymentPayload(updatedInvoice, response);
}

async function getCheckoutStatus(invoiceId) {
  const signupCheckout = await getSignupCheckout(invoiceId);
  if (signupCheckout) {
    if (signupCheckout.mp_payment_id && signupCheckout.status !== 'paid') {
      await processPaymentWebhook(signupCheckout.mp_payment_id);
    }

    const refreshed = await getSignupCheckout(invoiceId);
    return buildSignupPaymentPayload(refreshed);
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId }
  });

  if (!invoice) {
    throw new Error('Fatura nao encontrada.');
  }

  if (invoice.mp_payment_id && invoice.status !== 'paid') {
    await processPaymentWebhook(invoice.mp_payment_id);
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

async function processPaymentWebhook(paymentId, status) {
  try {
    const normalizedPaymentId = String(paymentId);

    const accessToken = getPlatformAccessToken();

    if (!status && accessToken) {
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(normalizedPaymentId)}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const payment = await response.json();
        status = payment.status;
      }
    }

    const signupCheckout = await prisma.signupCheckout.findFirst({
      where: { mp_payment_id: normalizedPaymentId },
      include: { plan: true }
    });

    if (signupCheckout) {
      if (status === 'approved') {
        await activateSignupCheckout(signupCheckout.id);
      } else if (status === 'rejected') {
        await prisma.signupCheckout.update({
          where: { id: signupCheckout.id },
          data: { status: 'failed' }
        });
      }
      return;
    }

    const invoice = await prisma.invoice.findFirst({
      where: { mp_payment_id: normalizedPaymentId }
    });

    if (!invoice) {
      console.log(`Fatura não encontrada para pagamento ${paymentId}`);
      return;
    }

    if (status === 'approved') {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'paid',
          paid_at: new Date()
        }
      });

      if (invoice.subscription_id) {
        const subscription = await prisma.subscription.findUnique({
          where: { id: invoice.subscription_id },
          include: { plan: true }
        });

        if (subscription) {
          const now = new Date();
          const newPeriodEnd = new Date(now);
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              status: 'active',
              current_period_start: now,
              current_period_end: newPeriodEnd
            }
          });

          await prisma.company.update({
            where: { id: subscription.company_id },
            data: {
              is_active: true,
              plan_id: subscription.plan_id,
              plan: subscription.plan.name,
              max_instances: subscription.plan.max_instances,
              max_users: subscription.plan.max_users,
              max_products: subscription.plan.max_products,
              expires_at: newPeriodEnd
            }
          });

          await Log.add(
            `Pagamento aprovado - Fatura renovada até ${newPeriodEnd.toLocaleDateString('pt-BR')}`,
            subscription.company_id
          );
        }
      }
    } else if (status === 'rejected') {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'failed' }
      });

      await Log.add(
        `Pagamento rejeitado - Fatura ${invoice.id}`,
        invoice.company_id
      );
    }
  } catch (error) {
    console.error('Erro ao processar webhook de pagamento:', error);
    throw error;
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
      throw new Error('Nenhuma assinatura ativa encontrada');
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
  listActivePlans,
  getCheckoutConfig,
  getInvoiceCheckout,
  createCheckoutPayment,
  getCheckoutStatus,
  createSubscription,
  createInvoice,
  checkExpiredSubscriptions,
  processPaymentWebhook,
  getCompanyInvoices,
  cancelSubscription
};
