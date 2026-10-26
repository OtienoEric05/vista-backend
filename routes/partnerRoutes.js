const express = require('express');
const router  = express.Router();
const partnerController           = require('../controllers/partnerController');
const { authenticate, authorize } = require('../lib/auth');
const { publicFormLimiter }       = require('../lib/rateLimiter');

// Public — rate limited
router.post('/apply', publicFormLimiter, partnerController.submitApplication);

// Admin only
router.get('/applications',             authenticate, authorize('ADMIN', 'MANAGER'), partnerController.getAllApplications);
router.get('/applications/:id',         authenticate, authorize('ADMIN', 'MANAGER'), partnerController.getApplicationById);
router.patch('/applications/:id/status',authenticate, authorize('ADMIN'), partnerController.updateApplicationStatus);

module.exports = router;
