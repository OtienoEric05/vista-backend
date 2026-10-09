const Appointment = require('../models/Appointment');
const { sendEmail }  = require('../lib/email');
const { sendSMS }    = require('../lib/sms');
const { sendWhatsApp } = require('../lib/whatsapp');
const { generateQuotePDF } = require('../lib/pdfService');
const { escapeHtml, isValidEmail, isValidObjectId } = require('../lib/sanitize');
const path = require('path');

const VALID_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED'];

const createAppointment = async (req, res) => {
  const { name, email, phone, date, time, consultationType, message } = req.body;

  if (!name?.trim() || !email?.trim() || !phone?.trim() || !date || !time || !consultationType?.trim()) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const safeName    = String(name).trim().slice(0, 200);
  const safeEmail   = String(email).trim().toLowerCase().slice(0, 200);
  const safePhone   = String(phone).trim().slice(0, 50);
  const safeType    = String(consultationType).trim().slice(0, 200);
  const safeTime    = String(time).trim().slice(0, 50);
  const safeMessage = message ? String(message).trim().slice(0, 2000) : '';

  try {
    const appointment = await Appointment.create({
      name:             safeName,
      email:            safeEmail,
      phone:            safePhone,
      date:             new Date(date),
      time:             safeTime,
      consultationType: safeType,
      message:          safeMessage,
      // Server-controlled
      status:      'PENDING',
      quoteStatus: 'DRAFT',
    });

    // HTML-escaped values for emails
    const eName  = escapeHtml(safeName);
    const eType  = escapeHtml(safeType);
    const eTime  = escapeHtml(safeTime);
    const eMsg   = escapeHtml(safeMessage);
    const ePhone = escapeHtml(safePhone);

    try {
      await sendEmail({
        to:      safeEmail,
        subject: 'Appointment Request Received: VistaVoyage',
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:auto;">
            <h2 style="color:#B8860B;">Consultation Request Received</h2>
            <p>Dear ${eName},</p>
            <p>We have received your request for a <strong>${eType}</strong> consultation.</p>
            <div style="background:#f9f9f9;padding:20px;border-radius:10px;margin:20px 0;">
              <p><strong>Date:</strong> ${new Date(date).toDateString()}</p>
              <p><strong>Time:</strong> ${eTime}</p>
              <p><strong>Location:</strong> Applewood Adams, Ngong Rd, Nairobi</p>
            </div>
            <p>Our team will contact you shortly to confirm the appointment.</p>
            <p>Best regards,<br/>The VistaVoyage Team</p>
          </div>
        `,
      });
    } catch (e) { console.error('❌ Client email error:', e.message); }

    try {
      await sendEmail({
        to:      process.env.COMPANY_EMAIL || 'info@vistavoyagetravel.group',
        replyTo: safeEmail,
        subject: `New Appointment Request: ${safeName}`,
        html: `
          <div style="font-family:sans-serif;">
            <h2>New Consultation Request</h2>
            <p><strong>Name:</strong> ${eName}</p>
            <p><strong>Email:</strong> ${escapeHtml(safeEmail)}</p>
            <p><strong>Phone:</strong> ${ePhone}</p>
            <p><strong>Topic:</strong> ${eType}</p>
            <p><strong>Date:</strong> ${new Date(date).toDateString()}</p>
            <p><strong>Time:</strong> ${eTime}</p>
            ${safeMessage ? `<p><strong>Message:</strong> ${eMsg}</p>` : ''}
          </div>
        `,
      });
    } catch (e) { console.error('❌ Company email error:', e.message); }

    const adminPhone    = process.env.ADMIN_PHONE;
    const adminWhatsApp = process.env.ADMIN_WHATSAPP || adminPhone;
    const notifyText    = `New Appointment: ${safeName} | ${safeType} | ${new Date(date).toDateString()} ${safeTime} | ${safePhone}`;

    if (adminPhone)    sendSMS(adminPhone, notifyText).catch(e => console.error('❌ SMS error:', e.message));
    if (adminWhatsApp) sendWhatsApp(adminWhatsApp, notifyText).catch(e => console.error('❌ WhatsApp error:', e.message));

    res.status(201).json(appointment);
  } catch (error) {
    console.error('❌ createAppointment:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

const getAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find().sort({ createdAt: -1 });
    res.json(appointments);
  } catch (error) {
    console.error('❌ getAppointments:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

const updateAppointmentStatus = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid ID' });

  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ message: 'Invalid status value' });
  }

  try {
    const appointment = await Appointment.findByIdAndUpdate(id, { status }, { new: true });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    if (status === 'CONFIRMED') {
      const eName = escapeHtml(appointment.name);
      const eType = escapeHtml(appointment.consultationType);
      try {
        await sendEmail({
          to:      appointment.email,
          subject: 'Appointment Confirmed - VistaVoyage',
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #eee;padding:20px;">
              <h2 style="color:#B8860B;">Consultation Confirmed!</h2>
              <p>Dear ${eName},</p>
              <p>Your <strong>${eType}</strong> consultation has been confirmed for ${new Date(appointment.date).toDateString()} at ${escapeHtml(appointment.time)}.</p>
              <p>Best regards,<br/>The VistaVoyage Team</p>
            </div>
          `,
        });
      } catch (e) { console.error('❌ Confirmation email error:', e.message); }
    }

    res.json(appointment);
  } catch (error) {
    console.error('❌ updateAppointmentStatus:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

const sendAppointmentQuote = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid ID' });

  const { quote, expiresAt, approve } = req.body;
  if (!quote?.trim()) return res.status(400).json({ message: 'Quote text is required' });

  try {
    const appointment = await Appointment.findById(id);
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

    appointment.quote = String(quote).trim().slice(0, 5000);
    if (expiresAt) appointment.quoteExpiresAt = new Date(expiresAt);

    if (approve) {
      appointment.quoteStatus = 'SENT';
      // Server-generated filename
      const pdfFilename = `quote_apt_${appointment._id}_${Date.now()}.pdf`;
      const pdfPath = await generateQuotePDF({
        refId:       String(appointment._id),
        guestName:   appointment.name,
        guestEmail:  appointment.email,
        guestPhone:  appointment.phone,
        packageName: `${appointment.consultationType} Consultation`,
        fromDate:    appointment.date,
        toDate:      appointment.date,
        adults:      1,
        children:    0,
        infant:      0,
        quoteText:   appointment.quote,
        expiresAt:   appointment.quoteExpiresAt,
      }, pdfFilename);

      appointment.quotePdfPath = pdfPath;

      const eName  = escapeHtml(appointment.name);
      const eType  = escapeHtml(appointment.consultationType);
      const eQuote = escapeHtml(appointment.quote);

      await sendEmail({
        to:      appointment.email,
        subject: 'Consultation Quote - VistaVoyage',
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:auto;border:1px solid #eee;padding:20px;">
            <h2 style="color:#B8860B;">Consultation Quote</h2>
            <p>Dear ${eName},</p>
            <p>Thank you for your interest in our <strong>${eType}</strong> consultation.</p>
            <div style="background:#f9f9f9;padding:20px;border-radius:10px;margin:20px 0;border-left:5px solid #B8860B;">
              <p style="white-space:pre-line;">${eQuote}</p>
            </div>
            <p>Please find the detailed PDF quotation attached.</p>
            <p>Best regards,<br/>The VistaVoyage Team</p>
          </div>
        `,
        attachments: [{
          filename: 'VistaVoyage_Consultation_Quotation.pdf',
          path:     path.join(__dirname, '..', pdfPath),
        }],
      });
    } else {
      appointment.quoteStatus = 'PENDING_APPROVAL';
    }

    await appointment.save();
    res.json({ message: approve ? 'Quote sent successfully' : 'Quote saved for approval', appointment });
  } catch (error) {
    console.error('❌ sendAppointmentQuote:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

module.exports = { createAppointment, getAppointments, updateAppointmentStatus, sendAppointmentQuote };
