const Application = require('../models/Application');
const Job         = require('../models/Job');
const multer      = require('multer');
const path        = require('path');
const fs          = require('fs');
const { sendWhatsApp }            = require('../lib/whatsapp');
const { sendEmail }               = require('../lib/emailService');

// ── Multer ────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/applications');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/pdf|doc|docx|jpg|jpeg|png/i.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

exports.upload = upload;

// ── Reference ID generator ────────────────────────────────────────────────────
const generateReferenceId = async () => {
  const year   = new Date().getFullYear();
  const prefix = `VV-CAREERS-${year}-`;
  const last   = await Application.findOne({ referenceId: { $regex: `^${prefix}` } })
    .sort({ createdAt: -1 }).select('referenceId').lean();
  const seq = last ? (parseInt(last.referenceId.replace(prefix, ''), 10) || 0) + 1 : 1;
  return `${prefix}${String(seq).padStart(5, '0')}`;
};

// ── Check duplicate ───────────────────────────────────────────────────────────
exports.checkDuplicate = async (req, res) => {
  try {
    const { email, position } = req.query;
    const exists = await Application.exists({ email: email?.toLowerCase(), position });
    res.json({ exists: !!exists });
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Submit application ────────────────────────────────────────────────────────
exports.submitApplication = async (req, res) => {
  try {
    const { email, position, jobId, yearsOfExperience } = req.body;

    // 1. Duplicate check
    const dup = await Application.exists({ email: email?.toLowerCase(), position });
    if (dup) return res.status(409).json({ message: 'You have already applied for this position.' });

    // 2. Load job requirements from DB (never trust client)
    const job = jobId ? await Job.findById(jobId) : null;
    const minimumExperience  = job?.minimumExperience  || 0;
    const requiredDocuments  = job?.requiredDocuments  || ['cvFile'];

    // 3. Backend screening
    const submittedYears = Math.max(0, parseInt(yearsOfExperience, 10) || 0);
    const files          = req.files || {};

    const minimumExperienceMet = submittedYears >= minimumExperience;

    const requiredDocumentsComplete = requiredDocuments.every(doc => !!files[doc]?.[0]);

    let screeningResult;
    if (!minimumExperienceMet) {
      screeningResult = 'below_minimum_experience';
    } else if (!requiredDocumentsComplete) {
      screeningResult = 'incomplete_documents';
    } else {
      screeningResult = 'qualified';
    }

    const isQualified = screeningResult === 'qualified';

    // 4. Generate reference ID
    const referenceId = await generateReferenceId();

    // 5. Save application
    const app = await Application.create({
      ...req.body,
      referenceId,
      jobId:             jobId || undefined,
      yearsOfExperience: submittedYears,
      cvFile:            files.cvFile?.[0]?.path       || null,
      coverLetter:       files.coverLetter?.[0]?.path  || null,
      certificates:      files.certificates?.[0]?.path || null,
      status:            'submitted',
      screening: {
        minimumExperienceMet,
        requiredDocumentsComplete,
        screeningResult,
      },
      notifications: {
        applicantConfirmationSent: false,
        hrNotificationSent:        false,
      },
    });

    // 6. Increment job applicant count
    if (jobId) await Job.findByIdAndUpdate(jobId, { $inc: { applicantCount: 1 } });

    // 7. Notify HR via WhatsApp + email only if qualified
    const adminWhatsApp = process.env.ADMIN_WHATSAPP || process.env.ADMIN_PHONE;
    const hrEmail       = process.env.HR_EMAIL || process.env.ADMIN_EMAIL;

    if (isQualified) {
      // WhatsApp
      if (adminWhatsApp) {
        const msg = `🎯 New Qualified Application\nRef: ${referenceId}\nPosition: ${position}\nApplicant: ${req.body.firstName} ${req.body.lastName}\nExperience: ${submittedYears} yrs\nDocuments: Complete`;
        sendWhatsApp(adminWhatsApp, msg)
          .then(() => Application.findByIdAndUpdate(app._id, { 'notifications.hrNotificationSent': true }))
          .catch(e => console.error('❌ WhatsApp HR notify failed:', e.message));
      }

      // Email
      if (hrEmail) {
        sendEmail({
          to:      hrEmail,
          subject: `New Qualified Application – ${position} [${referenceId}]`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:30px;border:1px solid #eee;border-radius:10px;">
              <h2 style="color:#c9a84c;margin-top:0;">🎯 New Qualified Job Application</h2>
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <tr style="background:#f7f7f7;"><td style="padding:10px;font-weight:600;width:40%;">Reference</td><td style="padding:10px;">${referenceId}</td></tr>
                <tr><td style="padding:10px;font-weight:600;">Position</td><td style="padding:10px;">${position}</td></tr>
                <tr style="background:#f7f7f7;"><td style="padding:10px;font-weight:600;">Applicant</td><td style="padding:10px;">${req.body.firstName} ${req.body.lastName}</td></tr>
                <tr><td style="padding:10px;font-weight:600;">Email</td><td style="padding:10px;"><a href="mailto:${email}">${email}</a></td></tr>
                <tr style="background:#f7f7f7;"><td style="padding:10px;font-weight:600;">Phone</td><td style="padding:10px;">${req.body.phone}</td></tr>
                <tr><td style="padding:10px;font-weight:600;">Experience</td><td style="padding:10px;">${submittedYears} years</td></tr>
                <tr style="background:#f7f7f7;"><td style="padding:10px;font-weight:600;">Documents</td><td style="padding:10px;">✅ Complete</td></tr>
              </table>
              <p style="margin-top:24px;font-size:13px;color:#888;">Log in to the admin dashboard to review this application.</p>
            </div>`,
        })
          .then(() => Application.findByIdAndUpdate(app._id, { 'notifications.hrNotificationSent': true }))
          .catch(e => console.error('❌ HR email failed:', e.message));
      }
    }

    res.status(201).json({
      message:      isQualified ? 'Application submitted successfully.' : 'Application received.',
      referenceId,
      screeningResult,
      qualified:    isQualified,
    });
  } catch (e) {
    console.error('submitApplication error:', e.message);
    res.status(500).json({ message: e.message });
  }
};

// ── Public: check application status by referenceId + email ──────────────────
exports.checkStatus = async (req, res) => {
  try {
    const { referenceId, email } = req.query;
    if (!referenceId || !email)
      return res.status(400).json({ message: 'referenceId and email are required' });

    const app = await Application.findOne({
      referenceId,
      email: email.toLowerCase(),
    }).select('referenceId position status screening createdAt updatedAt');

    if (!app) return res.status(404).json({ message: 'Application not found' });
    res.json(app);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Admin: get all applications ───────────────────────────────────────────────
exports.getApplications = async (req, res) => {
  try {
    const { status, screeningResult, position, search } = req.query;
    const filter = {};
    if (status)          filter.status = status;
    if (screeningResult) filter['screening.screeningResult'] = screeningResult;
    if (position)        filter.position = position;
    if (search) filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName:  { $regex: search, $options: 'i' } },
      { email:     { $regex: search, $options: 'i' } },
      { position:  { $regex: search, $options: 'i' } },
      { referenceId: { $regex: search, $options: 'i' } },
    ];
    res.json(await Application.find(filter).sort({ createdAt: -1 }));
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Admin: get single application ─────────────────────────────────────────────
exports.getApplication = async (req, res) => {
  try {
    const app = await Application.findById(req.params.id).populate('jobId', 'title department minimumExperience requiredDocuments');
    if (!app) return res.status(404).json({ message: 'Not found' });
    res.json(app);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Admin: update status / add HR note ───────────────────────────────────────
exports.updateApplication = async (req, res) => {
  try {
    const { hrNote, noteAuthor, ...rest } = req.body;
    const app = await Application.findById(req.params.id);
    if (!app) return res.status(404).json({ message: 'Not found' });
    Object.assign(app, rest);
    if (hrNote) app.hrNotes.push({ note: hrNote, addedBy: noteAuthor || 'HR' });
    await app.save();
    res.json(app);
  } catch (e) { res.status(500).json({ message: e.message }); }
};

// ── Admin: delete application ─────────────────────────────────────────────────
exports.deleteApplication = async (req, res) => {
  try {
    await Application.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (e) { res.status(500).json({ message: e.message }); }
};
