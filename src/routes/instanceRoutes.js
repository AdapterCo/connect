const express = require('express');
const instanceController = require('../controllers/instanceController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authenticateToken, instanceController.getInstances);
router.post('/', authenticateToken, instanceController.createInstance);
router.post('/:id/connect', authenticateToken, instanceController.connectInstance);
router.post('/:id/disconnect', authenticateToken, instanceController.disconnectInstance);
router.delete('/:id', authenticateToken, instanceController.deleteInstance);

module.exports = router;
