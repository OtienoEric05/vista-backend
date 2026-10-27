const express = require('express');
const { 
  createMessage, 
  getAllMessages, 
  updateMessageStatus, 
  deleteMessage 
} = require('../controllers/messageController');

const router = express.Router();

router.post('/', createMessage);
router.get('/', getAllMessages);
router.patch('/:id/status', updateMessageStatus);
router.delete('/:id', deleteMessage);

module.exports = router;
