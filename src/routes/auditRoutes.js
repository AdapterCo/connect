const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const auditController = require('../controllers/auditController');

router.get('/logs', authenticateToken, auditController.getAuditLogs);
router.get('/stats', authenticateToken, auditController.getAuditStats);

module.exports = router;
