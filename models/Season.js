const mongoose = require('mongoose');

const seasonSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g., Low, High, Peak
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  rate: { type: Number, default: 0 },
  image: { type: String },
  description: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Season', seasonSchema);
