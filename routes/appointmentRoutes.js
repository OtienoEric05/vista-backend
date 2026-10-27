const express = require('express');
const { createAppointment, getAppointments, updateAppointmentStatus, sendAppointmentQuote } = require('../controllers/appointmentController');

const router = express.Router();

router.post('/', createAppointment);
router.get('/', getAppointments);
router.patch('/:id/status', updateAppointmentStatus);
router.post('/:id/quote', sendAppointmentQuote);

module.exports = router;
