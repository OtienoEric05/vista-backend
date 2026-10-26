const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
  // ── Reference ──────────────────────────────────────────────────────────────
  referenceId:     { type: String, unique: true }, // VV-CAREERS-2026-00001

  // ── Job link ───────────────────────────────────────────────────────────────
  jobId:           { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
  position:        { type: String, required: true },

  // ── Personal ───────────────────────────────────────────────────────────────
  firstName:       { type: String, required: true },
  lastName:        { type: String, required: true },
  email:           { type: String, required: true, lowercase: true },
  phone:           { type: String, required: true },
  nationality:     String,
  location:        String,
  linkedin:        String,
  portfolio:       String,

  // ── Professional ───────────────────────────────────────────────────────────
  yearsOfExperience: { type: Number, default: 0 },  // numeric — used for screening
  experience:        String,                          // free-text description
  education:         String,
  currentEmployer:   String,
  currentTitle:      String,
  skills:            [String],

  // ── Availability ───────────────────────────────────────────────────────────
  availability:    String,
  employmentType:  String,
  expectedSalary:  String,

  // ── Files ──────────────────────────────────────────────────────────────────
  cvFile:          String,
  coverLetter:     String,
  certificates:    String,

  // ── Motivation ─────────────────────────────────────────────────────────────
  whyUs:           String,
  additionalInfo:  String,
  certified:       { type: Boolean, default: false },

  // ── Status pipeline ────────────────────────────────────────────────────────
  status: {
    type: String,
    enum: [
      'submitted',
      'screening',
      'under_review',
      'shortlisted',
      'interview',
      'final_review',
      'selected',
      'not_selected',
    ],
    default: 'submitted',
  },

  // ── Screening (set by backend, never trusted from client) ──────────────────
  screening: {
    minimumExperienceMet:      { type: Boolean, default: false },
    requiredDocumentsComplete: { type: Boolean, default: false },
    screeningResult: {
      type: String,
      enum: ['pending', 'qualified', 'below_minimum_experience', 'incomplete_documents'],
      default: 'pending',
    },
  },

  // ── Notifications ──────────────────────────────────────────────────────────
  notifications: {
    applicantConfirmationSent: { type: Boolean, default: false },
    hrNotificationSent:        { type: Boolean, default: false },
  },

  // ── HR ─────────────────────────────────────────────────────────────────────
  hrNotes: [{
    note:    String,
    addedBy: String,
    addedAt: { type: Date, default: Date.now },
  }],

}, { timestamps: true });

module.exports = mongoose.models.Application || mongoose.model('Application', applicationSchema);
