const ContactMessage = require('../models/ContactMessage');
const { sendEmail }  = require('../lib/email');
const { escapeHtml, isValidEmail } = require('../lib/sanitize');

const createContactMessage = async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ message: 'Name, email, and message are required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ message: 'Invalid email address' });
  }

  // Sanitize lengths
  const safeName    = String(name).trim().slice(0, 200);
  const safeEmail   = String(email).trim().toLowerCase().slice(0, 200);
  const safeSubject = subject ? String(subject).trim().slice(0, 300) : 'General Inquiry';
  const safeMessage = String(message).trim().slice(0, 5000);

  try {
    const savedMessage = await ContactMessage.create({
      name:    safeName,
      email:   safeEmail,
      subject: safeSubject,
      message: safeMessage,
    });

    // HTML-escape before inserting into email templates
    const eName    = escapeHtml(safeName);
    const eSubject = escapeHtml(safeSubject);
    const eMessage = escapeHtml(safeMessage);

    const emailStatus = { senderConfirmationSent: false, companyNotificationSent: false };

    try {
      await sendEmail({
        to:      safeEmail,
        subject: `We received your message: ${safeSubject}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #eee;border-radius:10px;">
            <h2 style="color:#B8860B;">Message Received</h2>
            <p>Dear ${eName},</p>
            <p>Thank you for contacting <strong>VistaVoyage</strong>. We have received your message and will respond shortly.</p>
            <div style="background:#f9f9f9;padding:16px;border-radius:8px;margin:20px 0;">
              <p><strong>Subject:</strong> ${eSubject}</p>
              <p><strong>Message:</strong></p>
              <p style="white-space:pre-line;">${eMessage}</p>
            </div>
            <p>Best regards,<br/>VistaVoyage Team</p>
          </div>
        `,
      });
      emailStatus.senderConfirmationSent = true;
    } catch (e) {
      console.error('❌ Sender confirmation email failed:', e.message);
    }

    try {
      await sendEmail({
        to:      process.env.COMPANY_EMAIL || 'info@vistavoyagetravel.group',
        replyTo: safeEmail,
        subject: `New Contact Message: ${safeSubject} - ${safeName}`,
        html: `
          <div style="font-family:sans-serif;max-width:700px;margin:auto;padding:20px;">
            <h2>New Contact Message</h2>
            <p><strong>Name:</strong> ${eName}</p>
            <p><strong>Email:</strong> ${escapeHtml(safeEmail)}</p>
            <p><strong>Subject:</strong> ${eSubject}</p>
            <hr/>
            <p><strong>Message:</strong></p>
            <p style="white-space:pre-line;">${eMessage}</p>
            <hr/>
            <p><strong>Submitted:</strong> ${savedMessage.createdAt.toISOString()}</p>
          </div>
        `,
      });
      emailStatus.companyNotificationSent = true;
    } catch (e) {
      console.error('❌ Company notification email failed:', e.message);
    }

    return res.status(201).json({
      success: true,
      id:      savedMessage._id,
      emailStatus,
      message: 'Contact message received successfully',
    });
  } catch (error) {
    console.error('❌ createContactMessage:', error.message);
    return res.status(500).json({ message: 'Failed to submit contact message' });
  }
};

module.exports = { createContactMessage };
