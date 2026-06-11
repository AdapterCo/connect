const express = require('express');
const paymentController = require('../controllers/paymentController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/webhook/mercadopago', paymentController.handleWebhook);
router.post('/chats/:id/charge', authenticateToken, paymentController.createCharge);
router.post('/chats/:id/check-payment', authenticateToken, paymentController.checkPaymentStatus);

module.exports = router;
