const express = require('express');
const userController = require('../controllers/userController');
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const audit = require('../middleware/auditMiddleware');
const { requireMinimumRole } = require('../middleware/rbacMiddleware');

const router = express.Router();

router.get('/', authenticateToken, checkCompanyActive, userController.listUsers);
router.post('/:id/revoke-sessions', authenticateToken, checkCompanyActive, requireMinimumRole('admin'), audit('user', 'revoke_sessions'), userController.revokeSessions);
router.delete('/:id', authenticateToken, checkCompanyActive, requireMinimumRole('supervisor'), audit('user', 'delete'), userController.deleteUser);

module.exports = router;
