const express = require('express');
const settingsController = require('../controllers/settingsController');
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const audit = require('../middleware/auditMiddleware');

const router = express.Router();

router.get('/', authenticateToken, checkCompanyActive, settingsController.getSettings);
router.post('/', authenticateToken, checkCompanyActive, audit('settings', 'update'), settingsController.updateSettings);

module.exports = router;
