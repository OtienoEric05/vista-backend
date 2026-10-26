const Job = require('../models/Job');

exports.getJobs = async (req, res) => {
  try {
    const filter = req.query.all === '1' ? {} : { status: 'published' };
    const jobs = await Job.find(filter).sort({ createdAt: -1 });
    res.json(jobs);
  } catch (error) {
    console.error('❌ getJobs error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.createJob = async (req, res) => {
  try {
    const { title, department, location, employmentType, experience, salary,
            description, deadline, responsibilities, qualifications,
            requirements, benefits, status } = req.body;

    if (!title) return res.status(400).json({ message: 'Job title is required' });

    const job = await Job.create({
      title, department, location, employmentType, experience, salary,
      description, responsibilities, qualifications, requirements, benefits,
      status: status || 'draft',
      deadline: deadline || undefined,
    });
    res.status(201).json(job);
  } catch (error) {
    console.error('❌ createJob error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.updateJob = async (req, res) => {
  try {
    const { title, department, location, employmentType, experience, salary,
            description, deadline, responsibilities, qualifications,
            requirements, benefits, status } = req.body;

    const update = {
      ...(title !== undefined && { title }),
      ...(department !== undefined && { department }),
      ...(location !== undefined && { location }),
      ...(employmentType !== undefined && { employmentType }),
      ...(experience !== undefined && { experience }),
      ...(salary !== undefined && { salary }),
      ...(description !== undefined && { description }),
      ...(deadline !== undefined && { deadline: deadline || undefined }),
      ...(responsibilities !== undefined && { responsibilities }),
      ...(qualifications !== undefined && { qualifications }),
      ...(requirements !== undefined && { requirements }),
      ...(benefits !== undefined && { benefits }),
      ...(status !== undefined && { status }),
    };

    const job = await Job.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!job) return res.status(404).json({ message: 'Job not found' });
    res.json(job);
  } catch (error) {
    console.error('❌ updateJob error:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    await Job.findByIdAndDelete(req.params.id);
    res.json({ message: 'Job deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
