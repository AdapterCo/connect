const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const auditController = require('../controllers/auditController');
const { requireMinimumRole } = require('../middleware/rbacMiddleware');

router.get('/logs', authenticateToken, requireMinimumRole('admin'), auditController.getAuditLogs);
router.get('/stats', authenticateToken, requireMinimumRole('admin'), auditController.getAuditStats);

module.exports = router;
