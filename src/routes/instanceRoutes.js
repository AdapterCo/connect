const express = require('express');
const instanceController = require('../controllers/instanceController');
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive, checkInstanceLimit } = require('../middleware/planMiddleware');
const audit = require('../middleware/auditMiddleware');

const router = express.Router();

router.get('/', authenticateToken, checkCompanyActive, instanceController.getInstances);
router.post('/', authenticateToken, checkCompanyActive, checkInstanceLimit, audit('instance', 'create'), instanceController.createInstance);
router.post('/:id/connect', authenticateToken, checkCompanyActive, audit('instance', 'connect'), instanceController.connectInstance);
router.post('/:id/disconnect', authenticateToken, checkCompanyActive, audit('instance', 'disconnect'), instanceController.disconnectInstance);
router.delete('/:id', authenticateToken, checkCompanyActive, audit('instance', 'delete'), instanceController.deleteInstance);

module.exports = router;
