const express = require('express');
const { 
  createBooking, 
  getBookings, 
  updateWorkflowStatus, 
  getQuotePrice
} = require('../controllers/bookingController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/price', getQuotePrice);
router.post('/', createBooking);
router.get('/', protect, getBookings);
router.patch('/:id/status', protect, updateWorkflowStatus);

module.exports = router;
