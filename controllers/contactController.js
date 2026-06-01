const ContactMessage = require('../models/ContactMessage');
const { sendEmail } = require('../lib/email');

const createContactMessage = async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({
      message: 'Name, email, and message are required',
    });
  }

  try {
    const savedMessage = await ContactMessage.create({
      name,
      email,
      subject: subject || 'General Inquiry',
      message,
    });

    const emailStatus = {
      senderConfirmationSent: false,
      companyNotificationSent: false,
    };

    try {
      await sendEmail({
        to: email,
        subject: `We received your message${subject ? `: ${subject}` : ''}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #B8860B; border-bottom: 2px solid #B8860B; padding-bottom: 10px;">Message Received</h2>
            <p>Dear ${name},</p>
            <p>Thank you for contacting <strong>VistaVoyage</strong>. We have received your message and our team will respond shortly.</p>
            <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Subject:</strong> ${subject || 'General Inquiry'}</p>
              <p><strong>Message:</strong></p>
              <p style="white-space: pre-line;">${message}</p>
            </div>
            <p>Best regards,<br/>VistaVoyage Team</p>
          </div>
        `,
      });
      emailStatus.senderConfirmationSent = true;
    } catch (senderErr) {
      console.error('❌ Failed to send sender confirmation email:', senderErr.message);
    }

    try {
      await sendEmail({
        to: process.env.COMPANY_EMAIL || 'info@vistavoyagetravel.group',
        replyTo: email,
        subject: `New Contact Message: ${subject || 'General Inquiry'} - ${name}`,
        html: `
          <div style="font-family: sans-serif; max-width: 700px; margin: auto; padding: 20px;">
            <h2>New Contact Message Received</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Subject:</strong> ${subject || 'General Inquiry'}</p>
            <p><strong>Message ID:</strong> ${savedMessage._id}</p>
            <hr/>
            <p><strong>Message:</strong></p>
            <p style="white-space: pre-line;">${message}</p>
            <hr/>
            <p><strong>Submitted:</strong> ${savedMessage.createdAt.toISOString()}</p>
          </div>
        `,
      });
      emailStatus.companyNotificationSent = true;
    } catch (companyErr) {
      console.error('❌ Failed to send company notification email:', companyErr.message);
    }

    return res.status(201).json({
      success: true,
      id: savedMessage._id,
      emailStatus,
      message: 'Contact message received successfully',
    });
  } catch (error) {
    console.error('❌ Error creating contact message:', error.message);
    return res.status(500).json({ message: 'Failed to submit contact message' });
  }
};

module.exports = {
  createContactMessage,
};
