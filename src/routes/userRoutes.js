const express = require('express');
const userController = require('../controllers/userController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authenticateToken, userController.listUsers);
router.delete('/:id', authenticateToken, userController.deleteUser);

module.exports = router;
