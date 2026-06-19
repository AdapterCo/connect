const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const printerController = require('../controllers/printerController');
const { requireMinimumRole } = require('../middleware/rbacMiddleware');

router.get('/', authenticateToken, checkCompanyActive, printerController.listPrinters);
router.post('/', authenticateToken, checkCompanyActive, requireMinimumRole('admin'), printerController.createPrinter);
router.put('/:id', authenticateToken, checkCompanyActive, requireMinimumRole('admin'), printerController.updatePrinter);
router.delete('/:id', authenticateToken, checkCompanyActive, requireMinimumRole('admin'), printerController.deletePrinter);

module.exports = router;
