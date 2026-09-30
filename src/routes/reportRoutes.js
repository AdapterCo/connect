const express = require('express');
const reportController = require('../controllers/reportController');
const authenticateToken = require('../middleware/authMiddleware');
const { checkCompanyActive } = require('../middleware/planMiddleware');

const router = express.Router();
const { requireRoles } = require('../middleware/rbacMiddleware');
// Este router e montado em '/api': os middlewares ficam em cada rota, pois um
// router.use() aqui seria executado para TODAS as rotas /api registradas depois.
const managers = [authenticateToken, checkCompanyActive, requireRoles('admin', 'supervisor')];

router.get('/reports/statistics', ...managers, reportController.getStatistics);
router.get('/logs', ...managers, reportController.getLogs);
router.post('/logs/clear', ...managers, reportController.clearLogs);

module.exports = router;
