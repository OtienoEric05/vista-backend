const express = require('express');
const { createAppointment, getAppointments, updateAppointmentStatus, sendAppointmentQuote } = require('../controllers/appointmentController');
const { authenticate, authorize } = require('../lib/auth');
const { publicFormLimiter }       = require('../lib/rateLimiter');

const router = express.Router();

// Public — rate limited
router.post('/', publicFormLimiter, createAppointment);

// Admin only
router.get('/',           authenticate, authorize('ADMIN', 'MANAGER', 'AGENT'), getAppointments);
router.patch('/:id/status', authenticate, authorize('ADMIN', 'MANAGER'), updateAppointmentStatus);
router.post('/:id/quote',   authenticate, authorize('ADMIN', 'MANAGER'), sendAppointmentQuote);

module.exports = router;
