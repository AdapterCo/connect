const express = require('express');
const chatController = require('../controllers/chatController');
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const { validateMessage } = require('../middleware/validationMiddleware');
const audit = require('../middleware/auditMiddleware');

const router = express.Router();
const { ownChat } = require('../middleware/accessMiddleware');

router.get('/', authenticateToken, checkCompanyActive, ownChat, chatController.getChats);
router.post('/', authenticateToken, checkCompanyActive, ownChat, audit('chat', 'create'), chatController.createChat);
router.get('/:id', authenticateToken, checkCompanyActive, ownChat, chatController.getChatById);
router.delete('/:id', authenticateToken, checkCompanyActive, ownChat, audit('chat', 'delete'), chatController.deleteChat);
router.post('/:id/status', authenticateToken, checkCompanyActive, ownChat, audit('chat', 'update_status'), chatController.updateStatus);
router.post('/:id/message', authenticateToken, checkCompanyActive, ownChat, validateMessage, audit('chat', 'send_message'), chatController.sendMessage);
router.post('/:id/assign', authenticateToken, checkCompanyActive, ownChat, audit('chat', 'assign'), chatController.assignChat);
router.post('/:id/ai-toggle', authenticateToken, checkCompanyActive, ownChat, audit('chat', 'toggle_ai'), chatController.toggleAi);
router.post('/:id/tags', authenticateToken, checkCompanyActive, ownChat, audit('chat', 'add_tag'), chatController.addTag);
router.delete('/:id/tags', authenticateToken, checkCompanyActive, ownChat, audit('chat', 'delete_tag'), chatController.deleteTag);
router.post('/:id/favorite', authenticateToken, checkCompanyActive, ownChat, audit('chat', 'toggle_favorite'), chatController.toggleFavorite);
router.post('/:id/archive', authenticateToken, checkCompanyActive, ownChat, audit('chat', 'toggle_archive'), chatController.toggleArchive);
router.post('/:id/block', authenticateToken, checkCompanyActive, ownChat, audit('chat', 'toggle_block'), chatController.toggleBlock);
router.post('/:id/sector', authenticateToken, checkCompanyActive, ownChat, audit('chat', 'update_sector'), chatController.updateSector);

module.exports = router;
