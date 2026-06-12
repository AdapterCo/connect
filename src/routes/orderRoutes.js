const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const orderController = require('../controllers/orderController');

router.get('/', authenticateToken, checkCompanyActive, orderController.listOrders);
router.get('/stats', authenticateToken, checkCompanyActive, orderController.getOrderStats);
router.get('/:id', authenticateToken, checkCompanyActive, orderController.getOrder);
router.post('/', authenticateToken, checkCompanyActive, orderController.createOrder);
router.put('/:id/status', authenticateToken, checkCompanyActive, orderController.updateOrderStatus);
router.post('/:id/print', authenticateToken, checkCompanyActive, orderController.printOrderManual);

module.exports = router;
