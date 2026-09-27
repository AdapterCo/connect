const express = require('express');
const scheduleController = require('../controllers/scheduleController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();
const { ownChat } = require('../middleware/accessMiddleware');

router.post('/:id/schedule', authenticateToken, ownChat, scheduleController.createSchedule);
router.get('/:id/schedule', authenticateToken, ownChat, scheduleController.listSchedules);
router.delete('/schedule/:id', authenticateToken, scheduleController.deleteSchedule);

module.exports = router;
