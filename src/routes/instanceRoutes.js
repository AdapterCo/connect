const express = require('express');
const instanceController = require('../controllers/instanceController');
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive, checkInstanceLimit } = require('../middleware/planMiddleware');
const audit = require('../middleware/auditMiddleware');
const { requireRoles } = require('../middleware/rbacMiddleware');

const router = express.Router();
const managers = requireRoles('admin', 'supervisor');

router.get('/', authenticateToken, checkCompanyActive, instanceController.getInstances);
router.post('/', authenticateToken, checkCompanyActive, managers, checkInstanceLimit, audit('instance', 'create'), instanceController.createInstance);
router.post('/:id/connect', authenticateToken, checkCompanyActive, managers, audit('instance', 'connect'), instanceController.connectInstance);
router.post('/:id/disconnect', authenticateToken, checkCompanyActive, managers, audit('instance', 'disconnect'), instanceController.disconnectInstance);
router.patch('/:id/assign', authenticateToken, checkCompanyActive, managers, audit('instance', 'assign_user'), instanceController.assignInstance);
router.delete('/:id', authenticateToken, checkCompanyActive, requireRoles('admin'), audit('instance', 'delete'), instanceController.deleteInstance);

module.exports = router;
