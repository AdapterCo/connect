const express = require('express');
const reportController = require('../controllers/reportController');
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');

const router = express.Router();

router.get('/reports/statistics', authenticateToken, checkCompanyActive, reportController.getStatistics);
router.get('/logs', authenticateToken, checkCompanyActive, reportController.getLogs);
router.post('/logs/clear', authenticateToken, checkCompanyActive, reportController.clearLogs);

module.exports = router;
