const express = require('express');
const chatController = require('../controllers/chatController');
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const { validateMessage } = require('../middleware/validationMiddleware');
const audit = require('../middleware/auditMiddleware');

const router = express.Router();

router.get('/', authenticateToken, checkCompanyActive, chatController.getChats);
router.post('/', authenticateToken, checkCompanyActive, audit('chat', 'create'), chatController.createChat);
router.get('/:id', authenticateToken, checkCompanyActive, chatController.getChatById);
router.delete('/:id', authenticateToken, checkCompanyActive, audit('chat', 'delete'), chatController.deleteChat);
router.post('/:id/status', authenticateToken, checkCompanyActive, audit('chat', 'update_status'), chatController.updateStatus);
router.put('/:id/status', authenticateToken, checkCompanyActive, audit('chat', 'update_status'), chatController.updateStatus);
router.post('/:id/message', authenticateToken, checkCompanyActive, validateMessage, audit('chat', 'send_message'), chatController.sendMessage);
router.post('/:id/assign', authenticateToken, checkCompanyActive, audit('chat', 'assign'), chatController.assignChat);
router.put('/:id/assign', authenticateToken, checkCompanyActive, audit('chat', 'assign'), chatController.assignChat);
router.post('/:id/ai-toggle', authenticateToken, checkCompanyActive, audit('chat', 'toggle_ai'), chatController.toggleAi);
router.put('/:id/ai', authenticateToken, checkCompanyActive, audit('chat', 'toggle_ai'), chatController.toggleAi);
router.post('/:id/tags', authenticateToken, checkCompanyActive, audit('chat', 'add_tag'), chatController.addTag);
router.put('/:id/tags', authenticateToken, checkCompanyActive, audit('chat', 'add_tag'), chatController.addTag);
router.delete('/:id/tags', authenticateToken, checkCompanyActive, audit('chat', 'delete_tag'), chatController.deleteTag);
router.post('/:id/favorite', authenticateToken, checkCompanyActive, audit('chat', 'toggle_favorite'), chatController.toggleFavorite);
router.put('/:id/favorite', authenticateToken, checkCompanyActive, audit('chat', 'toggle_favorite'), chatController.toggleFavorite);
router.post('/:id/archive', authenticateToken, checkCompanyActive, audit('chat', 'toggle_archive'), chatController.toggleArchive);
router.put('/:id/archive', authenticateToken, checkCompanyActive, audit('chat', 'toggle_archive'), chatController.toggleArchive);
router.post('/:id/block', authenticateToken, checkCompanyActive, audit('chat', 'toggle_block'), chatController.toggleBlock);
router.put('/:id/block', authenticateToken, checkCompanyActive, audit('chat', 'toggle_block'), chatController.toggleBlock);
router.post('/:id/sector', authenticateToken, checkCompanyActive, audit('chat', 'update_sector'), chatController.updateSector);
router.put('/:id/sector', authenticateToken, checkCompanyActive, audit('chat', 'update_sector'), chatController.updateSector);

module.exports = router;
