const bcrypt             = require('bcryptjs');
const PartnerApplication = require('../models/PartnerApplication');
const User               = require('../models/User');
const { isValidEmail, isValidObjectId } = require('../lib/sanitize');

const submitApplication = async (req, res) => {
  // Explicit allowlist — no mass assignment
  const {
    companyName, businessType, country, city, website,
    contactName, jobTitle, email, phone,
    yearsInOperation, licenseNumber,
    servicesOffered, targetMarkets,
  } = req.body;

  if (!companyName || !businessType || !country || !city || !contactName || !jobTitle || !email || !phone || !licenseNumber) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const application = await PartnerApplication.create({
      companyName:      String(companyName).trim().slice(0, 200),
      businessType:     String(businessType).trim().slice(0, 100),
      country:          String(country).trim().slice(0, 100),
      city:             String(city).trim().slice(0, 100),
      website:          website ? String(website).trim().slice(0, 300) : undefined,
      contactName:      String(contactName).trim().slice(0, 100),
      jobTitle:         String(jobTitle).trim().slice(0, 100),
      email:            String(email).trim().toLowerCase().slice(0, 200),
      phone:            String(phone).trim().slice(0, 50),
      yearsInOperation: parseInt(yearsInOperation, 10) || 0,
      licenseNumber:    String(licenseNumber).trim().slice(0, 100),
      servicesOffered:  Array.isArray(servicesOffered) ? servicesOffered.map(s => String(s).trim().slice(0, 100)) : [],
      targetMarkets:    Array.isArray(targetMarkets)   ? targetMarkets.map(s => String(s).trim().slice(0, 100))   : [],
      // Server-controlled — never from client
      status: 'PENDING',
    });
    res.status(201).json({ message: 'Application submitted successfully', id: application._id });
  } catch (error) {
    console.error('❌ submitApplication:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

const getAllApplications = async (req, res) => {
  try {
    const applications = await PartnerApplication.find().sort({ createdAt: -1 });
    res.json(applications);
  } catch (error) {
    console.error('❌ getAllApplications:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

const getApplicationById = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid ID' });
  try {
    const application = await PartnerApplication.findById(req.params.id);
    if (!application) return res.status(404).json({ message: 'Application not found' });
    res.json(application);
  } catch (error) {
    console.error('❌ getApplicationById:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

const updateApplicationStatus = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid ID' });

  const VALID_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid status value' });
  }

  try {
    const application = await PartnerApplication.findById(id);
    if (!application) return res.status(404).json({ message: 'Application not found' });

    application.status = status;
    await application.save();

    if (status === 'APPROVED') {
      const existing = await User.findOne({ email: application.email });
      if (!existing) {
        // Generate a secure random temporary password — never store plaintext
        const tempPassword = require('crypto').randomBytes(12).toString('hex');
        const salt   = await bcrypt.genSalt(12);
        const hashed = await bcrypt.hash(tempPassword, salt);

        await User.create({
          email:   application.email,
          name:    application.contactName,
          password: hashed,
          role:    'PARTNER',
          status:  'offline',
          partnerDetails: {
            companyName:  application.companyName,
            businessType: application.businessType,
          },
        });
        // TODO: send tempPassword to partner via email so they can set their own
        console.log(`✅ Partner account created for ${application.email}`);
      } else {
        existing.role = 'PARTNER';
        existing.partnerDetails = {
          companyName:  application.companyName,
          businessType: application.businessType,
        };
        await existing.save();
      }
    }

    res.json({ message: `Application ${status.toLowerCase()} successfully` });
  } catch (error) {
    console.error('❌ updateApplicationStatus:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

module.exports = { submitApplication, getAllApplications, getApplicationById, updateApplicationStatus };
