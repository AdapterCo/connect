const express = require('express');
const scheduleController = require('../controllers/scheduleController');
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const { validateSchedule } = require('../middleware/validationMiddleware');

const router = express.Router();

router.post('/:id/schedule', authenticateToken, checkCompanyActive, validateSchedule, scheduleController.createSchedule);
router.get('/:id/schedule', authenticateToken, checkCompanyActive, scheduleController.listSchedules);
router.delete('/schedule/:id', authenticateToken, checkCompanyActive, scheduleController.deleteSchedule);

module.exports = router;
