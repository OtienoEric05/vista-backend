const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  name:             { type: String, required: true },
  propertyType:     { type: String, default: 'Luxury Lodge' },
  destinationName:  { type: String, default: '' },
  country:          { type: String, default: '' },
  location:         { type: String, default: '' },
  starRating:       { type: Number, default: 5 },
  shortDescription: { type: String, default: '' },
  amenities:        [{ type: String }],
  heroImage:        { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Property', propertySchema);
