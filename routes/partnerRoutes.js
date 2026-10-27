const express = require('express');
const router = express.Router();
const partnerController = require('../controllers/partnerController');

// Public route for application submission
router.post('/apply', partnerController.submitApplication);

// Admin routes (should be protected in a real app)
router.get('/applications', partnerController.getAllApplications);
router.get('/applications/:id', partnerController.getApplicationById);
router.patch('/applications/:id/status', partnerController.updateApplicationStatus);

module.exports = router;
