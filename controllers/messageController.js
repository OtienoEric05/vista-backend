const Message = require('../models/Message');

const createMessage = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    const newMessage = new Message({ name, email, subject, message });
    await newMessage.save();
    
    // Emit for real-time admin notification
    const io = req.app.get('io');
    if (io) io.emit('newMessage', newMessage);

    res.status(201).json(newMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllMessages = async (req, res) => {
  try {
    const messages = await Message.find().sort({ createdAt: -1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateMessageStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const message = await Message.findByIdAndUpdate(id, { status }, { new: true });
    if (!message) return res.status(404).json({ message: 'Message not found' });
    res.json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteMessage = async (req, res) => {
  const { id } = req.params;
  try {
    const message = await Message.findByIdAndDelete(id);
    if (!message) return res.status(404).json({ message: 'Message not found' });
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createMessage,
  getAllMessages,
  updateMessageStatus,
  deleteMessage
};
