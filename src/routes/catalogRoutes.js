const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');
const catalogController = require('../controllers/catalogController');

router.get('/categories', authenticateToken, checkCompanyActive, catalogController.listCategories);
router.post('/categories', authenticateToken, checkCompanyActive, catalogController.createCategory);
router.put('/categories/:id', authenticateToken, checkCompanyActive, catalogController.updateCategory);
router.delete('/categories/:id', authenticateToken, checkCompanyActive, catalogController.deleteCategory);

router.get('/products', authenticateToken, checkCompanyActive, catalogController.listProducts);
router.get('/products/:id', authenticateToken, checkCompanyActive, catalogController.getProduct);
router.post('/products', authenticateToken, checkCompanyActive, catalogController.createProduct);
router.put('/products/:id', authenticateToken, checkCompanyActive, catalogController.updateProduct);
router.delete('/products/:id', authenticateToken, checkCompanyActive, catalogController.deleteProduct);

module.exports = router;
