const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String },
  name: { type: String },
  role: { 
    type: String, 
    enum: ['USER', 'ADMIN', 'MANAGER', 'AGENT', 'PARTNER'], 
    default: 'USER' 
  },
  status: {
    type: String,
    enum: ['online', 'working', 'away', 'offline'],
    default: 'offline'
  },
  lastActivity: { type: Date, default: Date.now },
  permissions: [String],
  partnerDetails: {
    companyName: String,
    businessType: String
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
