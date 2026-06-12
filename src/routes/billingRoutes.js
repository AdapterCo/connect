const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const billingController = require('../controllers/billingController');

router.post('/subscribe', authenticateToken, billingController.createSubscription);
router.get('/invoices', authenticateToken, billingController.getInvoices);
router.post('/cancel', authenticateToken, billingController.cancelSubscription);
router.post('/webhook/billing', billingController.handleBillingWebhook);

module.exports = router;
