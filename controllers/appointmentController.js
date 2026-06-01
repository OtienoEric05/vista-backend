const Appointment = require('../models/Appointment');
const { sendEmail } = require('../lib/email');
const { sendSMS } = require('../lib/sms');
const { generateQuotePDF } = require('../lib/pdfGenerator');
const path = require('path');

const createAppointment = async (req, res) => {
  const { name, email, phone, date, time, consultationType, message } = req.body;

  try {
    const appointment = new Appointment({
      name,
      email,
      phone,
      date: new Date(date),
      time,
      consultationType,
      message,
    });

    await appointment.save();
    console.log('📅 Appointment created and saved to DB:', appointment._id);

    // Notify Client via Email
    try {
      await sendEmail({
        to: email,
        subject: `Appointment Request Received: VistaVoyage`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
            <h2 style="color: #B8860B;">Consultation Request Received</h2>
            <p>Dear ${name},</p>
            <p>We have received your request for a <strong>${consultationType}</strong> consultation.</p>
            <div style="background: #f9f9f9; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <p><strong>Date:</strong> ${new Date(date).toDateString()}</p>
              <p><strong>Time:</strong> ${time}</p>
              <p><strong>Location:</strong> Applewood Adams, Ngong Rd, Nairobi</p>
            </div>
            <p>Our team will contact you shortly to confirm the appointment and provide payment details for the consultation fee.</p>
            <p>Best regards,<br/>The VistaVoyage Team</p>
          </div>
        `
      });
    } catch (e) {
      console.error('Email error:', e.message);
    }

    // Notify Company via Email
    try {
      await sendEmail({
        to: process.env.COMPANY_EMAIL || 'info@vistavoyagetravel.group',
        from: process.env.EMAIL_USER,
        replyTo: email,
        subject: `New Appointment Request: ${name}`,
        html: `
          <div style="font-family: sans-serif;">
            <h2>New Consultation Request</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Phone:</strong> ${phone}</p>
            <p><strong>Topic:</strong> ${consultationType}</p>
            <p><strong>Preferred Date:</strong> ${new Date(date).toDateString()}</p>
            <p><strong>Preferred Time:</strong> ${time}</p>
            <p><strong>Message:</strong> ${message}</p>
          </div>
        `
      });
    } catch (e) {
      console.error('Company Email error:', e.message);
    }

    /* 
    // Notify Client via SMS
    if (phone) {
      const smsMessage = `Hi ${name}, we've received your ${consultationType} consultation request for ${new Date(date).toDateString()} at ${time}. VistaVoyage will contact you shortly.`;
      await sendSMS(phone, smsMessage);
    }
    */

    res.status(201).json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find().sort({ createdAt: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateAppointmentStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const appointment = await Appointment.findByIdAndUpdate(id, { status }, { new: true });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    // Send confirmation email if status is changed to CONFIRMED
    if (status === 'CONFIRMED') {
      try {
        await sendEmail({
          to: appointment.email,
          subject: 'Appointment Confirmed - VistaVoyage',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
              <h2 style="color: #B8860B;">Consultation Confirmed!</h2>
              <p>Dear ${appointment.name},</p>
              <p>We are happy to inform you that your <strong>${appointment.consultationType}</strong> consultation has been confirmed for ${new Date(appointment.date).toDateString()} at ${appointment.time}.</p>
              <p><strong>Our team will get back to you within 1 hour</strong> with more details regarding your session.</p>
              <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Appointment ID:</strong> ${appointment._id}</p>
                <p><strong>Status:</strong> Confirmed</p>
              </div>
              <p>We look forward to speaking with you!</p>
              <p>Best regards,<br/>The VistaVoyage Team</p>
            </div>
          `
        });
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError.message);
      }
    }

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const sendAppointmentQuote = async (req, res) => {
  const { id } = req.params;
  const { quote, expiresAt, approve } = req.body;

  try {
    const appointment = await Appointment.findById(id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    appointment.quote = quote;
    if (expiresAt) appointment.quoteExpiresAt = new Date(expiresAt);

    if (approve) {
      appointment.quoteStatus = 'SENT';

      // Generate PDF
      const pdfFilename = `quote_apt_${appointment._id}_${Date.now()}.pdf`;
      const pdfPath = await generateQuotePDF({
        id: appointment._id,
        name: appointment.name,
        email: appointment.email,
        phone: appointment.phone,
        tourTitle: `${appointment.consultationType} Consultation`,
        location: 'Nairobi / Remote',
        duration: '1 Hour',
        quote: quote,
        expiresAt: appointment.quoteExpiresAt
      }, pdfFilename);

      appointment.quotePdfPath = pdfPath;

      // Send Email with PDF
      await sendEmail({
        to: appointment.email,
        subject: 'Consultation Quote - VistaVoyage',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
            <h2 style="color: #B8860B;">Consultation Quote</h2>
            <p>Dear ${appointment.name},</p>
            <p>Thank you for your interest in our <strong>${appointment.consultationType}</strong> consultation services. Based on your request, here is our proposed quote:</p>
            
            <div style="background: #f9f9f9; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 5px solid #B8860B;">
              <p style="white-space: pre-line;">${quote}</p>
            </div>

            <p>Please find the detailed PDF quotation attached to this email.</p>
            <p>Best regards,<br/>The VistaVoyage Team</p>
          </div>
        `,
        attachments: [
          {
            filename: 'VistaVoyage_Consultation_Quotation.pdf',
            path: path.join(__dirname, '..', pdfPath)
          }
        ]
      });

      console.log('📧 Appointment quote email with PDF sent to:', appointment.email);
    } else {
      appointment.quoteStatus = 'PENDING_APPROVAL';
    }

    await appointment.save();
    res.json({ message: approve ? 'Quote sent successfully' : 'Quote saved for approval', appointment });
  } catch (error) {
    console.error('❌ Error in sendAppointmentQuote:', error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { createAppointment, getAppointments, updateAppointmentStatus, sendAppointmentQuote };
