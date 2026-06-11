const express = require('express');
const chatController = require('../controllers/chatController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authenticateToken, chatController.getChats);
router.post('/', authenticateToken, chatController.createChat);
router.get('/:id', authenticateToken, chatController.getChatById);
router.delete('/:id', authenticateToken, chatController.deleteChat);
router.post('/:id/status', authenticateToken, chatController.updateStatus);
router.post('/:id/message', authenticateToken, chatController.sendMessage);
router.post('/:id/assign', authenticateToken, chatController.assignChat);
router.post('/:id/ai-toggle', authenticateToken, chatController.toggleAi);
router.post('/:id/tags', authenticateToken, chatController.addTag);
router.delete('/:id/tags', authenticateToken, chatController.deleteTag);
router.post('/:id/favorite', authenticateToken, chatController.toggleFavorite);
router.post('/:id/archive', authenticateToken, chatController.toggleArchive);
router.post('/:id/block', authenticateToken, chatController.toggleBlock);
router.post('/:id/sector', authenticateToken, chatController.updateSector);

module.exports = router;
