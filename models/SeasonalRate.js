const mongoose = require('mongoose');

// Hidden pricing — only surfaced via search, never shown on public pages
const seasonalRateSchema = new mongoose.Schema({
  destination:        { type: String, required: true },   // e.g. "Masai Mara"
  packageName:        { type: String, required: true },   // e.g. "Masai Mara Safari"
  seasonLabel:        { type: String, required: true },   // e.g. "High Season"
  startDate:          { type: Date,   required: true },
  endDate:            { type: Date,   required: true },
  perPersonSharing:   { type: Number, required: true },
  singleRoom:         { type: Number, default: 0 },
  childRate:          { type: Number, default: 0 },
  currency:           { type: String, default: 'USD' },
  duration:           { type: String },                   // e.g. "3 Days / 2 Nights"
  inclusions:         [{ type: String }],
  notes:              { type: String },
  showOnWebsite:      { type: Boolean, default: false },  // Always false — search only
}, { timestamps: true });

seasonalRateSchema.index({ destination: 'text' });
seasonalRateSchema.index({ startDate: 1, endDate: 1 });

module.exports = mongoose.model('SeasonalRate', seasonalRateSchema);
