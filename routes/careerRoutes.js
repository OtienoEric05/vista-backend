const express = require('express');
const router = express.Router();
const { getJobs, createJob, updateJob, deleteJob } = require('../controllers/careerController');
const {
  upload, checkDuplicate, submitApplication,
  getApplications, getApplication, updateApplication, deleteApplication,
  checkStatus,
} = require('../controllers/applicationController');

// ── Job routes ────────────────────────────────────────────────────────────────
router.get('/jobs', getJobs);          // public — used by careers page
router.get('/jobs/:id', async (req, res) => {
  try {
    const Job = require('../models/Job');
    const job = await Job.findById(req.params.id);
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json(job);
  } catch (e) { res.status(500).json({ message: e.message }); }
});
router.post('/jobs', createJob);
router.put('/jobs/:id', updateJob);
router.patch('/jobs/:id', updateJob);
router.delete('/jobs/:id', deleteJob);

// ── Application routes ────────────────────────────────────────────────────────
router.get('/applications/check',  checkDuplicate);
router.get('/applications/status', checkStatus);       // public: ?referenceId=&email=
router.get('/applications',        getApplications);
router.get('/applications/:id',    getApplication);
router.post('/applications', upload.fields([
  { name: 'cvFile', maxCount: 1 },
  { name: 'coverLetter', maxCount: 1 },
  { name: 'certificates', maxCount: 1 },
]), submitApplication);
router.put('/applications/:id', updateApplication);
router.delete('/applications/:id', deleteApplication);

module.exports = router;
