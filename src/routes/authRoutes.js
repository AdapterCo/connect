const express = require('express');
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/login', authController.login);
router.post('/logout', authenticateToken, authController.logout);
router.post('/status', authenticateToken, authController.updateStatus);
router.post('/register', authenticateToken, authController.register);
router.post('/register-tenant', authController.registerTenant);

module.exports = router;
