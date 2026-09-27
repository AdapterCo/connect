const express = require('express');
const reportController = require('../controllers/reportController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();
const { managersOnly } = require('../middleware/accessMiddleware');

router.get('/reports/statistics', authenticateToken, managersOnly, reportController.getStatistics);
router.get('/logs', authenticateToken, managersOnly, reportController.getLogs);
router.post('/logs/clear', authenticateToken, managersOnly, reportController.clearLogs);

module.exports = router;

