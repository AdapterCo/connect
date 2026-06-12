const express = require('express');
const userController = require('../controllers/userController');
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const audit = require('../middleware/auditMiddleware');

const router = express.Router();

router.get('/', authenticateToken, checkCompanyActive, userController.listUsers);
router.delete('/:id', authenticateToken, checkCompanyActive, audit('user', 'delete'), userController.deleteUser);

module.exports = router;
