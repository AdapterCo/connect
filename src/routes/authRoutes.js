const express = require('express');
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive, checkUserLimit } = require('../middleware/planMiddleware');
const { validateLogin, validateRegister, validateRegisterTenant } = require('../middleware/validationMiddleware');
const audit = require('../middleware/auditMiddleware');

const router = express.Router();

router.post('/login', validateLogin, audit('auth', 'login'), authController.login);
router.post('/logout', authenticateToken, checkCompanyActive, audit('auth', 'logout'), authController.logout);
router.post('/status', authenticateToken, checkCompanyActive, authController.updateStatus);
router.post('/register', authenticateToken, checkCompanyActive, checkUserLimit, validateRegister, audit('user', 'create'), authController.register);
router.post('/register-tenant', validateRegisterTenant, audit('company', 'register_tenant'), authController.registerTenant);

module.exports = router;
