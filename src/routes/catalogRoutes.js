const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const catalogController = require('../controllers/catalogController');
const { requireMinimumRole } = require('../middleware/rbacMiddleware');

router.get('/categories', authenticateToken, checkCompanyActive, catalogController.listCategories);
router.post('/categories', authenticateToken, checkCompanyActive, requireMinimumRole('supervisor'), catalogController.createCategory);
router.put('/categories/:id', authenticateToken, checkCompanyActive, requireMinimumRole('supervisor'), catalogController.updateCategory);
router.delete('/categories/:id', authenticateToken, checkCompanyActive, requireMinimumRole('admin'), catalogController.deleteCategory);

router.get('/products', authenticateToken, checkCompanyActive, catalogController.listProducts);
router.get('/products/:id', authenticateToken, checkCompanyActive, catalogController.getProduct);
router.post('/products', authenticateToken, checkCompanyActive, requireMinimumRole('supervisor'), catalogController.createProduct);
router.put('/products/:id', authenticateToken, checkCompanyActive, requireMinimumRole('supervisor'), catalogController.updateProduct);
router.delete('/products/:id', authenticateToken, checkCompanyActive, requireMinimumRole('admin'), catalogController.deleteProduct);

router.get('/public/:slug', catalogController.getPublicCatalog);

module.exports = router;
