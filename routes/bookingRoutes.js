const express = require('express');
const { 
  createBooking, 
  getBookings, 
  updateWorkflowStatus, 
  getQuotePrice
} = require('../controllers/bookingController');

const router = express.Router();

router.get('/price', getQuotePrice);
router.post('/', createBooking);
router.get('/', getBookings);
router.patch('/:id/status', updateWorkflowStatus);

module.exports = router;
