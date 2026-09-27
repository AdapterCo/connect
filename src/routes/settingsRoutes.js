const express = require('express');
const settingsController = require('../controllers/settingsController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();
const { managersOnly } = require('../middleware/accessMiddleware');

router.get('/', authenticateToken, managersOnly, settingsController.getSettings);
router.post('/', authenticateToken, managersOnly, settingsController.updateSettings);

module.exports = router;
