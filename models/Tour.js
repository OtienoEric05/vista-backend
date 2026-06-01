const mongoose = require('mongoose');

const tourSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, required: true },
  price:       { type: Number, required: true },
  duration:    { type: String, required: true },
  location:    { type: String, required: true },
  category:    { type: String, default: 'General' },
  image:       { type: String },
  gallery:     [{ type: String }],
  tag:         { type: String },
  tags:        [{ type: String }],
  available:   { type: Boolean, default: true },
  seasonalPrices: [{
    season: { type: mongoose.Schema.Types.ObjectId, ref: 'Season' },
    price:  { type: Number, required: true }
  }],
  itinerary: [{
    day:         Number,
    title:       String,
    description: String
  }],
  inclusions: [String],
  exclusions: [String]
}, { timestamps: true });

tourSchema.index({ createdAt: -1 });
tourSchema.index({ tag: 1 });
tourSchema.index({ title: 'text', location: 'text' });

module.exports = mongoose.model('Tour', tourSchema);
