const express = require('express');
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const { requireMinimumRole } = require('../middleware/rbacMiddleware');
const audit = require('../middleware/auditMiddleware');
const privacyController = require('../controllers/privacyController');

const router = express.Router();

router.get('/clients/:chatId/export', authenticateToken, checkCompanyActive, requireMinimumRole('admin'), audit('privacy', 'export'), privacyController.exportClientData);
router.post('/clients/:chatId/anonymize', authenticateToken, checkCompanyActive, requireMinimumRole('admin'), audit('privacy', 'anonymize'), privacyController.anonymizeClientData);
router.delete('/clients/:chatId', authenticateToken, checkCompanyActive, requireMinimumRole('admin'), audit('privacy', 'delete'), privacyController.deleteClientData);

module.exports = router;
