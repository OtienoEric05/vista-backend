const express = require('express');
const { 
  createMessage, 
  getAllMessages, 
  updateMessageStatus, 
  deleteMessage 
} = require('../controllers/messageController');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', createMessage);
router.get('/', protect, admin, getAllMessages);
router.patch('/:id/status', protect, admin, updateMessageStatus);
router.delete('/:id', protect, admin, deleteMessage);

module.exports = router;
