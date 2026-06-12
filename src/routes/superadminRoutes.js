const express = require('express');
const router = express.Router();
const requireSuperAdmin = require('../middleware/superadminMiddleware');
const superadminController = require('../controllers/superadminController');

router.use(requireSuperAdmin);

router.get('/companies', superadminController.listCompanies);
router.get('/companies/:id', superadminController.getCompany);
router.post('/companies', superadminController.createCompany);
router.put('/companies/:id', superadminController.updateCompany);
router.delete('/companies/:id', superadminController.deleteCompany);

router.get('/plans', superadminController.listPlans);
router.post('/plans', superadminController.createPlan);
router.put('/plans/:id', superadminController.updatePlan);
router.delete('/plans/:id', superadminController.deletePlan);

module.exports = router;
