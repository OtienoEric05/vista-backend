const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  consultationType: { type: String, required: true },
  message: { type: String },
  quote: { type: String },
  quoteStatus: { 
    type: String, 
    enum: ['DRAFT', 'PENDING_APPROVAL', 'SENT', 'EXPIRED'], 
    default: 'DRAFT' 
  },
  quoteExpiresAt: { type: Date },
  quotePdfPath: { type: String },
  status: { 
    type: String, 
    enum: ['PENDING', 'CONFIRMED', 'CANCELLED'], 
    default: 'PENDING' 
  },
}, { timestamps: true });

module.exports = mongoose.model('Appointment', appointmentSchema);
