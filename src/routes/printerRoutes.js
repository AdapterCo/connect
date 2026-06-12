const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const printerController = require('../controllers/printerController');

router.get('/', authenticateToken, checkCompanyActive, printerController.listPrinters);
router.post('/', authenticateToken, checkCompanyActive, printerController.createPrinter);
router.put('/:id', authenticateToken, checkCompanyActive, printerController.updatePrinter);
router.delete('/:id', authenticateToken, checkCompanyActive, printerController.deletePrinter);

module.exports = router;
