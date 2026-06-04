const express = require('express');
const {
  createBooking,
  getBookings,
  updateWorkflowStatus,
  getQuotePrice,
  assignWorkers,
  addInternalNote,
  sendBookingQuote
} = require('../controllers/bookingController');

const router = express.Router();

router.get('/price',              getQuotePrice);
router.post('/',                  createBooking);
router.get('/',                   getBookings);
router.patch('/:id/status',       updateWorkflowStatus);
router.patch('/:id/assign',       assignWorkers);
router.post('/:id/note',          addInternalNote);
router.post('/:id/send-quote',    sendBookingQuote);

module.exports = router;
