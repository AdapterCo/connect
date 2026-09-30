const billingService = require('../services/billingService');

// Apenas erros de regra de negocio (BillingError) expõem a mensagem; falhas
// internas (banco, SDK do Mercado Pago, configuracao) ficam so no log.
function sendError(res, error, status, fallback) {
  if (error instanceof billingService.BillingError) {
    return res.status(status).json({ error: error.message });
  }
  console.error('[Billing]', error);
  return res.status(500).json({ error: fallback });
}

async function listPlans(req, res) {
  try {
    const plans = await billingService.listActivePlans();
    res.json(plans);
  } catch (error) {
    sendError(res, error, 500, 'Erro ao listar planos.');
  }
}

async function getCheckoutConfig(req, res) {
  try {
    const config = await billingService.getCheckoutConfig();
    res.json(config);
  } catch (error) {
    sendError(res, error, 500, 'Erro ao carregar checkout.');
  }
}

async function getCheckoutInvoice(req, res) {
  try {
    const invoice = await billingService.getInvoiceCheckout(req.params.invoiceId);
    res.json({
      id: invoice.id,
      amount: invoice.amount,
      status: invoice.status,
      company: invoice.company,
      plan: invoice.subscription?.plan || null
    });
  } catch (error) {
    sendError(res, error, 404, 'Erro ao carregar fatura.');
  }
}

async function createCheckoutPayment(req, res) {
  try {
    const payment = await billingService.createCheckoutPayment(req.params.invoiceId, req.body);
    res.json({ success: true, payment });
  } catch (error) {
    sendError(res, error, 400, 'Não foi possível processar o pagamento. Tente novamente.');
  }
}

async function getCheckoutStatus(req, res) {
  try {
    const status = await billingService.getCheckoutStatus(req.params.invoiceId);
    res.json(status);
  } catch (error) {
    sendError(res, error, 404, 'Erro ao consultar pagamento.');
  }
}

async function createSubscription(req, res) {
  try {
    const { planId } = req.body;
    const companyId = req.user.company_id;

    if (!planId || typeof planId !== 'string') {
      return res.status(400).json({ error: 'Plano é obrigatório' });
    }

    const result = await billingService.createSubscription(companyId, planId);

    res.json({
      success: true,
      subscription: result.subscription,
      invoice: result.invoice,
      payment_url: result.mp_payment_url
    });
  } catch (error) {
    sendError(res, error, 400, 'Erro ao criar assinatura.');
  }
}

async function getInvoices(req, res) {
  try {
    const companyId = req.user.company_id;
    const invoices = await billingService.getCompanyInvoices(companyId);
    res.json(invoices);
  } catch (error) {
    sendError(res, error, 500, 'Erro ao listar faturas.');
  }
}

async function cancelSubscription(req, res) {
  try {
    const companyId = req.user.company_id;
    const subscription = await billingService.cancelSubscription(companyId);
    res.json({ success: true, subscription });
  } catch (error) {
    sendError(res, error, 400, 'Erro ao cancelar assinatura.');
  }
}

module.exports = {
  listPlans,
  getCheckoutConfig,
  getCheckoutInvoice,
  createCheckoutPayment,
  getCheckoutStatus,
  createSubscription,
  getInvoices,
  cancelSubscription
};
