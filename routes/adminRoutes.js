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
  getCustomers,
  adminLogin
} = require('../controllers/adminController');

const {
  assignWorkers,
  updateWorkflowStatus,
  addInternalNote,
  sendBookingQuote
} = require('../controllers/bookingController');

const { protect, optionalAuth } = require('../lib/auth');

// Public — login only
router.post('/auth/login', adminLogin);

// Dashboard stats — accessible with or without token (uses optionalAuth)
router.get('/stats', optionalAuth, getStats);

// All routes below require a valid JWT
router.use(protect);
router.get('/tasks', getTasks);
router.post('/tasks', createTask);
router.patch('/tasks/:id', updateTaskStatus);
router.get('/activity', getActivity);
router.get('/staff', getStaff);
router.post('/staff', addStaff);
router.get('/customers', getCustomers);

router.post('/bookings/:id/assign', assignWorkers);
router.patch('/bookings/:id/workflow', updateWorkflowStatus);
router.post('/bookings/:id/notes', addInternalNote);
router.post('/bookings/:id/quote', sendBookingQuote);

module.exports = router;
