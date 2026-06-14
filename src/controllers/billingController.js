const billingService = require('../services/billingService');

async function listPlans(req, res) {
  try {
    const plans = await billingService.listActivePlans();
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createSubscription(req, res) {
  try {
    const { planId } = req.body;
    const companyId = req.user.company_id;

    if (!planId) {
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
    res.status(400).json({ error: error.message });
  }
}

async function getInvoices(req, res) {
  try {
    const companyId = req.user.company_id;
    const invoices = await billingService.getCompanyInvoices(companyId);
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function cancelSubscription(req, res) {
  try {
    const companyId = req.user.company_id;
    const subscription = await billingService.cancelSubscription(companyId);
    res.json({ success: true, subscription });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

async function handleBillingWebhook(req, res) {
  try {
    const { type, data } = req.body;

    if (type === 'payment') {
      const paymentId = data.id;
      const status = data.status;

      await billingService.processPaymentWebhook(paymentId, status);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Erro no webhook de billing:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  listPlans,
  createSubscription,
  getInvoices,
  cancelSubscription,
  handleBillingWebhook
};
