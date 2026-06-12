const { prisma } = require('../config/database');
const mercadopago = require('mercadopago');
const Log = require('../models/Log');

const PLATFORM_MP_ACCESS_TOKEN = process.env.PLATFORM_MP_ACCESS_TOKEN || '';

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

    if (!plan) {
      throw new Error('Plano não encontrado');
    }

    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        company_id: companyId,
        status: 'active'
      }
    });

    if (existingSubscription) {
      throw new Error('Empresa já possui uma assinatura ativa');
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    let mpSubscriptionId = null;
    let mpPayerId = null;

    if (PLATFORM_MP_ACCESS_TOKEN && plan.price > 0) {
      try {
        const client = new mercadopago.MercadoPagoConfig({
          accessToken: PLATFORM_MP_ACCESS_TOKEN
        });

        const preapproval = new mercadopago.PreApproval(client);
        const preapprovalData = {
          reason: `Assinatura ${plan.name} - Adapter Connect`,
          external_reference: `${companyId}_${planId}`,
          payer_email: company.mp_webhook_url || 'cliente@example.com',
          auto_recurring: {
            frequency: 1,
            frequency_type: 'months',
            transaction_amount: plan.price,
            currency_id: 'BRL',
            start_date: now.toISOString(),
            end_date: new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString()
          },
          back_url: `https://${process.env.DOMAIN || 'localhost:3000'}/billing`
        };

        const response = await preapproval.create({ body: preapprovalData });
        mpSubscriptionId = response.id;
        mpPayerId = response.payer_id;
      } catch (mpError) {
        console.error('Erro ao criar assinatura no Mercado Pago:', mpError);
      }
    }

    const subscription = await prisma.subscription.create({
      data: {
        company_id: companyId,
        plan_id: planId,
        status: 'active',
        current_period_start: now,
        current_period_end: periodEnd,
        mp_subscription_id: mpSubscriptionId,
        mp_payer_id: mpPayerId
      }
    });

    await prisma.company.update({
      where: { id: companyId },
      data: {
        plan_id: planId,
        plan: plan.name,
        max_instances: plan.max_instances,
        max_users: plan.max_users,
        expires_at: periodEnd,
        is_active: true
      }
    });

    const invoice = await createInvoice(companyId, subscription.id, plan.price, periodEnd);

    await Log.add(`Assinatura criada para empresa ${company.name} - Plano ${plan.name}`, companyId);

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
    let mpPaymentId = null;
    let mpPaymentUrl = null;

    if (PLATFORM_MP_ACCESS_TOKEN && amount > 0) {
      try {
        const client = new mercadopago.MercadoPagoConfig({
          accessToken: PLATFORM_MP_ACCESS_TOKEN
        });

        const payment = new mercadopago.Payment(client);
        const paymentData = {
          transaction_amount: amount,
          description: `Fatura Adapter Connect - ${new Date(dueDate).toLocaleDateString('pt-BR')}`,
          payment_method_id: 'pix',
          payer: {
            email: 'cliente@example.com'
          },
          external_reference: `${companyId}_${subscriptionId}_${Date.now()}`
        };

        const response = await payment.create({ body: paymentData });
        mpPaymentId = response.id;
        mpPaymentUrl = response.point_of_interaction?.transaction_data?.ticket_url || null;
      } catch (mpError) {
        console.error('Erro ao criar pagamento no Mercado Pago:', mpError);
      }
    }

    const invoice = await prisma.invoice.create({
      data: {
        company_id: companyId,
        subscription_id: subscriptionId,
        amount,
        status: 'pending',
        mp_payment_id: mpPaymentId,
        mp_payment_url: mpPaymentUrl,
        due_date: dueDate
      }
    });

    return invoice;
  } catch (error) {
    console.error('Erro ao criar fatura:', error);
    throw error;
  }
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
    const invoice = await prisma.invoice.findFirst({
      where: { mp_payment_id: paymentId }
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
          const newPeriodEnd = new Date(subscription.current_period_end);
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              status: 'active',
              current_period_end: newPeriodEnd
            }
          });

          await prisma.company.update({
            where: { id: subscription.company_id },
            data: {
              is_active: true,
              expires_at: newPeriodEnd
            }
          });

          await createInvoice(
            subscription.company_id,
            subscription.id,
            subscription.plan.price,
            newPeriodEnd
          );

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
  createSubscription,
  createInvoice,
  checkExpiredSubscriptions,
  processPaymentWebhook,
  getCompanyInvoices,
  cancelSubscription
};
