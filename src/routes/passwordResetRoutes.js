const express = require('express');
const router = express.Router();
const passwordResetController = require('../controllers/passwordResetController');
const { authLimiter } = require('../middleware/rateLimitMiddleware');

router.post('/request', authLimiter, passwordResetController.requestPasswordReset);
router.get('/validate/:token', passwordResetController.validateResetToken);
router.post('/reset', authLimiter, passwordResetController.resetPassword);

module.exports = router;
