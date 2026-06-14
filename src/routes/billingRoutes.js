const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const billingController = require('../controllers/billingController');

router.get('/plans', billingController.listPlans);
router.get('/checkout/config', billingController.getCheckoutConfig);
router.get('/checkout/:invoiceId', billingController.getCheckoutInvoice);
router.post('/checkout/:invoiceId/payment', billingController.createCheckoutPayment);
router.get('/checkout/:invoiceId/status', billingController.getCheckoutStatus);
router.post('/subscribe', authenticateToken, billingController.createSubscription);
router.get('/invoices', authenticateToken, billingController.getInvoices);
router.post('/cancel', authenticateToken, billingController.cancelSubscription);
router.post('/webhook/billing', billingController.handleBillingWebhook);

module.exports = router;
