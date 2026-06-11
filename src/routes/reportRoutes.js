const express = require('express');
const reportController = require('../controllers/reportController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/reports/statistics', authenticateToken, reportController.getStatistics);
router.get('/logs', authenticateToken, reportController.getLogs);
router.post('/logs/clear', authenticateToken, reportController.clearLogs);

module.exports = router;

