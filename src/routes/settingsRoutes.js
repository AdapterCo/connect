const express = require('express');
const settingsController = require('../controllers/settingsController');
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const audit = require('../middleware/auditMiddleware');
const { requireMinimumRole } = require('../middleware/rbacMiddleware');

const router = express.Router();

router.get('/', authenticateToken, checkCompanyActive, requireMinimumRole('admin'), settingsController.getSettings);
router.post('/', authenticateToken, checkCompanyActive, requireMinimumRole('admin'), audit('settings', 'update'), settingsController.updateSettings);

module.exports = router;
