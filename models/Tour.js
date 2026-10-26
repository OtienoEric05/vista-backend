const mongoose = require('mongoose');

const tourSchema = new mongoose.Schema({
  title:           { type: String, required: true, trim: true },
  subtitle:        { type: String, trim: true },
  slug:            { type: String, trim: true, index: true },
  description:     { type: String, required: true },
  fullDescription: { type: String },
  travelType:      { 
    type: String, 
    enum: ['experience', 'journey', 'worldwide'], 
    default: 'journey',
    index: true 
  },
  price:           { type: Number, required: true, default: 0 },
  currency:        { type: String, default: 'USD' },
  priceType:       { type: String, default: 'per_person' },
  displayPrice:    { type: String },
  duration:        { type: String, required: true },
  nights:          { type: Number, default: 0 },
  location:        { type: String, default: '' },
  destination:     { type: String, default: '' },
  country:         { type: String, default: 'Kenya' },
  region:          { type: String, default: '' },
  destinationRef:  { type: mongoose.Schema.Types.ObjectId, ref: 'Destination' },
  category:        { type: String, default: 'Luxury Safari' },
  travelStyle:     { type: String, default: 'Private' },
  difficulty:      { type: String, default: 'Easy' },
  bestSeason:      { type: String, default: 'Year-Round' },
  minTravelers:    { type: Number, default: 1 },
  maxTravelers:    { type: Number, default: 20 },
  image:           { type: String },
  gallery:         [{ type: String }],
  videoUrl:        { type: String },
  tag:             { type: String },
  tags:            [{ type: String }],
  status:          { 
    type: String, 
    enum: ['draft', 'published', 'archived'], 
    default: 'published',
    index: true 
  },
  featured:        { type: Boolean, default: false, index: true },
  availability:    { type: Boolean, default: true },
  available:       { type: Boolean, default: true },
  showOnWebsite:   { type: Boolean, default: true },
  seoTitle:        { type: String },
  seoDescription:  { type: String },
  seoKeywords:     { type: String },
  seoSlug:         { type: String },
  highlights: [{
    title:       String,
    description: String,
  }],
  itinerary: [{
    day:           Number,
    timings:       String,
    title:         String,
    description:   String,
    meals:         { type: mongoose.Schema.Types.Mixed, default: '' },
    accommodation: String,
    activities:    [{ type: mongoose.Schema.Types.Mixed }],
    notes:         String,
  }],
  inclusions:      [{ type: String }],
  exclusions:      [{ type: String }],
  accommodationOptions: [{
    name:          String,
    location:      String,
    category:      String,
    description:   String,
    facilities:    [String],
    propertyImage: String,
    startingPrice: String,
    recommended:   Boolean,
    featured:      Boolean,
    sortOrder:     Number,
    snapshot:      mongoose.Schema.Types.Mixed,
  }],
  accommodations: [{
    name:          String,
    location:      String,
    category:      String,
    description:   String,
    facilities:    [String],
    rates:         { type: mongoose.Schema.Types.Mixed, default: {} },
    startingPrice: String,
    recommended:   Boolean,
  }],
  experienceOptions: [{
    experience:    { type: mongoose.Schema.Types.ObjectId, ref: 'Experience' },
    experienceName:String,
    included:      { type: Boolean, default: false },
    supplement:    Number,
    notes:         String,
  }],
  transportOptions: [{
    transport:     { type: mongoose.Schema.Types.ObjectId, ref: 'Transport' },
    transportName: String,
    included:      { type: Boolean, default: false },
    supplement:    Number,
    notes:         String,
  }],
  travelInfo:          { type: String },
  bestTimeToVisit:     { type: String },
  whatToPack:          { type: String },
  travelRequirements:  { type: String },
  healthSafety:        { type: String },
  cancellationPolicy:  { type: String },
  importantNotes:      { type: String },
  bookingType:         { type: String, default: 'enquiry' },
  requiresApproval:    { type: Boolean, default: true },
  onlinePayment:       { type: Boolean, default: false },
  notes:               { type: String },
  faq: [{
    question: String,
    answer:   String,
  }],
  pricingRules:        [{ type: mongoose.Schema.Types.Mixed }],
  seasonalPrices: [{
    season: { type: mongoose.Schema.Types.ObjectId, ref: 'Season' },
    price:  { type: Number, required: true },
  }],
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Auto-sync location/destination and generate slug if missing
tourSchema.pre('save', function (next) {
  if (!this.destination && this.location) this.destination = this.location;
  if (!this.location && this.destination) this.location = this.destination;
  if (!this.slug && this.title) {
    this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  if (this.availability !== undefined && this.available === undefined) {
    this.available = this.availability;
  }
  if (this.available !== undefined && this.availability === undefined) {
    this.availability = this.available;
  }
  next();
});

tourSchema.index({ createdAt: -1 });
tourSchema.index({ slug: 1 });
tourSchema.index({ travelType: 1, status: 1 });
tourSchema.index({ status: 1, featured: -1 });
tourSchema.index({ title: 'text', location: 'text', destination: 'text', description: 'text' });

module.exports = mongoose.model('Tour', tourSchema);
