const express = require('express');
const scheduleController = require('../controllers/scheduleController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/:id/schedule', authenticateToken, scheduleController.createSchedule);
router.get('/:id/schedule', authenticateToken, scheduleController.listSchedules);
router.delete('/schedule/:id', authenticateToken, scheduleController.deleteSchedule);

module.exports = router;
