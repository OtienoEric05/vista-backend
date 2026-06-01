const mongoose = require('mongoose');

const partnerApplicationSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  businessType: { type: String, required: true },
  country: { type: String, required: true },
  city: { type: String, required: true },
  website: { type: String },
  contactName: { type: String, required: true },
  jobTitle: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  yearsInOperation: { type: Number, required: true },
  licenseNumber: { type: String, required: true },
  servicesOffered: [{ type: String }],
  targetMarkets: [{ type: String }],
  documents: { type: String }, // URL to uploaded docs
  status: { 
    type: String, 
    enum: ['PENDING', 'APPROVED', 'REJECTED'], 
    default: 'PENDING' 
  }
}, { timestamps: true });

module.exports = mongoose.model('PartnerApplication', partnerApplicationSchema);
