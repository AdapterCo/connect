const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const billingController = require('../controllers/billingController');
const { requireRoles } = require('../middleware/rbacMiddleware');

const adminOnly = requireRoles('admin');

router.get('/plans', billingController.listPlans);
router.get('/checkout/config', billingController.getCheckoutConfig);
router.get('/checkout/:invoiceId', billingController.getCheckoutInvoice);
router.post('/checkout/:invoiceId/payment', billingController.createCheckoutPayment);
router.get('/checkout/:invoiceId/status', billingController.getCheckoutStatus);
// Assinatura e faturas da empresa: somente o administrador.
router.post('/subscribe', authenticateToken, adminOnly, billingController.createSubscription);
router.get('/invoices', authenticateToken, adminOnly, billingController.getInvoices);
router.post('/cancel', authenticateToken, adminOnly, billingController.cancelSubscription);
// Sem webhook: pagamentos sao confirmados apenas por consulta direta a API do
// Mercado Pago (polling em /checkout/:invoiceId/status).

module.exports = router;
