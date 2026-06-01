const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  author: { type: String, required: true }, // Name of the user
  authorEmail: { type: String, required: true }, // To link to user
  image: { type: String },
  status: { 
    type: String, 
    enum: ['PENDING', 'APPROVED', 'REJECTED'], 
    default: 'PENDING' 
  },
  tags: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Blog', blogSchema);
