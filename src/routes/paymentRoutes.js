const express = require('express');
const paymentController = require('../controllers/paymentController');
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const { validateCharge } = require('../middleware/validationMiddleware');

const router = express.Router();

router.post('/webhook/mercadopago', paymentController.handleWebhook);
router.post('/chats/:id/charge', authenticateToken, checkCompanyActive, validateCharge, paymentController.createCharge);
router.post('/chats/:id/check-payment', authenticateToken, checkCompanyActive, paymentController.checkPaymentStatus);

module.exports = router;
