const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title:            { type: String, required: true },
  department:       { type: String, default: '' },
  location:         { type: String, default: '' },
  employmentType:   { type: String, default: 'Full-time' },
  experience:       { type: String, default: '' },
  minimumExperience:{ type: Number, default: 0 },  // years — used for backend screening
  requiredDocuments:{ type: [String], default: ['cvFile'] }, // e.g. ['cvFile','coverLetter','certificates']
  salary:           { type: String, default: '' },
  description:      { type: String, default: '' },
  deadline:         { type: Date },
  responsibilities: { type: [String], default: [] },
  qualifications:   { type: [String], default: [] },
  requirements:     { type: [String], default: [] },
  benefits:         { type: [String], default: [] },
  status:           { type: String, enum: ['draft', 'published', 'closed', 'archived'], default: 'draft' },
  applicantCount:   { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Job', jobSchema);
