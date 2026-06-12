const express = require('express');
const companyController = require('../controllers/companyController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/plan-info', authenticateToken, companyController.getPlanInfo);

module.exports = router;
