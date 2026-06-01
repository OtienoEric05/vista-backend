const express = require('express');
const router = express.Router();
const { 
  getStats, 
  getTasks, 
  createTask, 
  updateTaskStatus, 
  getActivity, 
  getStaff,
  addStaff,
  getCustomers
} = require('../controllers/adminController');

const { 
  assignWorkers,
  updateWorkflowStatus,
  addInternalNote,
  sendBookingQuote
} = require('../controllers/bookingController');

const { protect, admin } = require('../middleware/authMiddleware');

console.log('🛡️ Admin router initialized');

router.get('/stats', protect, admin, getStats);
router.get('/tasks', protect, admin, getTasks);
router.post('/tasks', protect, admin, createTask);
router.patch('/tasks/:id', protect, admin, updateTaskStatus);
router.get('/activity', protect, admin, getActivity);
router.get('/staff', protect, admin, getStaff);
router.post('/staff', protect, admin, addStaff);
router.get('/customers', protect, admin, getCustomers);

// Booking Management Actions
router.post('/bookings/:id/assign', protect, admin, assignWorkers);
router.patch('/bookings/:id/workflow', protect, admin, updateWorkflowStatus);
router.post('/bookings/:id/notes', protect, admin, addInternalNote);
router.post('/bookings/:id/quote', protect, admin, sendBookingQuote);

module.exports = router;
