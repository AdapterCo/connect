const express = require('express');
const instanceController = require('../controllers/instanceController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();
const { managersOnly } = require('../middleware/accessMiddleware');

router.get('/', authenticateToken, managersOnly, instanceController.getInstances);
router.post('/', authenticateToken, managersOnly, instanceController.createInstance);
router.post('/:id/connect', authenticateToken, managersOnly, instanceController.connectInstance);
router.post('/:id/disconnect', authenticateToken, managersOnly, instanceController.disconnectInstance);
router.delete('/:id', authenticateToken, managersOnly, instanceController.deleteInstance);

module.exports = router;
