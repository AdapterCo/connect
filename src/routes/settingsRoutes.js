const express = require('express');
const settingsController = require('../controllers/settingsController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authenticateToken, settingsController.getSettings);
router.post('/', authenticateToken, settingsController.updateSettings);

module.exports = router;
