const PartnerApplication = require('../models/PartnerApplication');
const User = require('../models/User');

const submitApplication = async (req, res) => {
  try {
    const application = new PartnerApplication(req.body);
    await application.save();
    res.status(201).json({ message: 'Application submitted successfully', application });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllApplications = async (req, res) => {
  try {
    const applications = await PartnerApplication.find().sort({ createdAt: -1 });
    res.json(applications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getApplicationById = async (req, res) => {
  try {
    const application = await PartnerApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ message: 'Application not found' });
    res.json(application);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateApplicationStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const application = await PartnerApplication.findById(id);
    if (!application) return res.status(404).json({ message: 'Application not found' });

    application.status = status;
    await application.save();

    if (status === 'APPROVED') {
      // Create partner account
      // In a real app, we would send an email for them to set a password
      // For now, let's create a dummy user
      const existingUser = await User.findOne({ email: application.email });
      if (!existingUser) {
        const newUser = new User({
          email: application.email,
          password: 'Password123!', // Dummy password
          name: application.contactName,
          role: 'PARTNER',
          partnerDetails: {
            companyName: application.companyName,
            businessType: application.businessType
          }
        });
        await newUser.save();
      } else {
        existingUser.role = 'PARTNER';
        existingUser.partnerDetails = {
          companyName: application.companyName,
          businessType: application.businessType
        };
        await existingUser.save();
      }
    }

    res.json({ message: `Application ${status.toLowerCase()} successfully`, application });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  submitApplication,
  getAllApplications,
  getApplicationById,
  updateApplicationStatus
};
