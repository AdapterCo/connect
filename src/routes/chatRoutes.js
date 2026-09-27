const express = require('express');
const chatController = require('../controllers/chatController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();
const { ownChat } = require('../middleware/accessMiddleware');

router.get('/', authenticateToken, ownChat, chatController.getChats);
router.post('/', authenticateToken, ownChat, chatController.createChat);
router.get('/:id', authenticateToken, ownChat, chatController.getChatById);
router.delete('/:id', authenticateToken, ownChat, chatController.deleteChat);
router.post('/:id/status', authenticateToken, ownChat, chatController.updateStatus);
router.post('/:id/message', authenticateToken, ownChat, chatController.sendMessage);
router.post('/:id/assign', authenticateToken, ownChat, chatController.assignChat);
router.post('/:id/ai-toggle', authenticateToken, ownChat, chatController.toggleAi);
router.post('/:id/tags', authenticateToken, ownChat, chatController.addTag);
router.delete('/:id/tags', authenticateToken, ownChat, chatController.deleteTag);
router.post('/:id/favorite', authenticateToken, ownChat, chatController.toggleFavorite);
router.post('/:id/archive', authenticateToken, ownChat, chatController.toggleArchive);
router.post('/:id/block', authenticateToken, ownChat, chatController.toggleBlock);
router.post('/:id/sector', authenticateToken, ownChat, chatController.updateSector);

module.exports = router;
