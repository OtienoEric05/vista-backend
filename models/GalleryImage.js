const mongoose = require('mongoose');

const galleryImageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  filename: { type: String, required: true },
  caption: { type: String, default: '' },
  category: { type: String, default: 'General' },
  uploadedBy: { type: String, default: 'admin' }, // 'admin' or submitter name
  submitterEmail: { type: String, default: '' },
  source: { type: String, enum: ['admin', 'public'], default: 'admin' },
  status: { type: String, enum: ['approved', 'pending', 'rejected'], default: 'approved' },
}, { timestamps: true });

module.exports = mongoose.model('GalleryImage', galleryImageSchema);
