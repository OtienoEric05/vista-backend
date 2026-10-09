const express = require('express');
const { createMessage, getAllMessages, updateMessageStatus, deleteMessage } = require('../controllers/messageController');
const { authenticate, authorize } = require('../lib/auth');
const { publicFormLimiter }       = require('../lib/rateLimiter');

const router = express.Router();

// Public — rate limited
router.post('/', publicFormLimiter, createMessage);

// Admin only
router.get('/',           authenticate, authorize('ADMIN', 'MANAGER', 'AGENT'), getAllMessages);
router.patch('/:id/status', authenticate, authorize('ADMIN', 'MANAGER'), updateMessageStatus);
router.delete('/:id',       authenticate, authorize('ADMIN'), deleteMessage);

module.exports = router;
