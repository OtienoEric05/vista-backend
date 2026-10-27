const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  referenceId: { type: String, unique: true },  // e.g. VV-2026-0001
  tour: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Tour',
    required: false
  },
  tourId: { type: String },
  packageName: { type: String },                // Human-readable package name
  fromDate: { type: Date, required: false },
  toDate: { type: Date, required: false },
  guestName: { type: String, required: true },
  guestEmail: { type: String, required: true },
  guestPhone: { type: String, required: true },
  guestsCount: { type: Number, default: 1 },
  children: { type: Number, default: 0 },
  infant:   { type: Number, default: 0 },
  message:  { type: String },
  totalPrice: { type: Number, required: false, default: 0 },
  quote: { type: String },
  quoteStatus: { 
    type: String, 
    enum: ['NOT_SENT', 'SENT', 'PENDING_RESPONSE', 'CONFIRMED'], 
    default: 'NOT_SENT' 
  },
  workflowStatus: { 
    type: String, 
    enum: ['NEW', 'ASSIGNED', 'QUOTE_SENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'COMPLETED', 'CANCELLED'], 
    default: 'NEW' 
  },
  paymentStatus: {
    type: String,
    enum: ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED'],
    default: 'UNPAID'
  },
  assignedWorkers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  internalNotes: [{
    text: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],
  activityTimeline: [{
    action: String,
    details: String,
    timestamp: { type: Date, default: Date.now },
    performer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  quoteExpiresAt: { type: Date },
  quotePdfPath: { type: String },
  status: { 
    type: String, 
    enum: ['PENDING', 'CONFIRMED', 'CANCELLED'], 
    default: 'PENDING' 
  },
  confirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  quotedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  respondedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  type: {
    type: String,
    enum: ['FLIGHT', 'APPOINTMENT', 'PACKAGE'],
    default: 'PACKAGE'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, { timestamps: true });

bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ workflowStatus: 1, createdAt: -1 });
bookingSchema.index({ type: 1, createdAt: -1 });
bookingSchema.index({ guestEmail: 1 });
bookingSchema.index({ fromDate: 1 });

module.exports = mongoose.model('Booking', bookingSchema);
