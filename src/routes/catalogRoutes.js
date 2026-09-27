const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const catalogController = require('../controllers/catalogController');
const { requireMinimumRole } = require('../middleware/rbacMiddleware');

router.get('/categories', authenticateToken, checkCompanyActive, requireMinimumRole('supervisor'), catalogController.listCategories);
router.post('/categories', authenticateToken, checkCompanyActive, requireMinimumRole('supervisor'), catalogController.createCategory);
router.put('/categories/:id', authenticateToken, checkCompanyActive, requireMinimumRole('supervisor'), catalogController.updateCategory);
router.delete('/categories/:id', authenticateToken, checkCompanyActive, requireMinimumRole('admin'), catalogController.deleteCategory);

// Products use the store API so legacy routes cannot bypass sale/ownership checks.
router.use('/products', require('./productRoutes'));
router.get('/public/:slug', (req, res) => res.status(410).json({ error: 'Catalogo publico de delivery desativado.' }));

module.exports = router;
