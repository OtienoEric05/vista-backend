const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  staffId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
  },
  action: { type: String, required: true },
  metadata: { type: Object },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Activity', activitySchema);
