const nodemailer = require('nodemailer');

// ─── Lazy transporter (reads env at first call, not at module load) ───────────
let _transporter = null;

const getTransporter = () => {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,          // STARTTLS for 587, SSL for 465
    auth: { user, pass },
    tls:  { rejectUnauthorized: false },   // works for self-signed / cPanel certs
  });

  return _transporter;
};

const isConfigured = () => {
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const placeholders = ['', 'your_smtp_user', 'your_smtp_pass', 'your-email@example.com'];
  return !placeholders.includes(user) && !placeholders.includes(pass);
};

// ─── Core send ────────────────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html, replyTo, attachments = [] }) => {
  if (!isConfigured()) {
    console.warn('⚠️  emailService: SMTP_USER / SMTP_PASS not set — email skipped');
    return { skipped: true };
  }

  const sender = process.env.SMTP_USER;
  const companyName = process.env.COMPANY_NAME || 'Vista Voyage';

  try {
    const info = await getTransporter().sendMail({
      from:        `"${companyName}" <${sender}>`,
      to,
      subject,
      html,
      replyTo,
      attachments,
    });
    console.log(`📧 Sent → ${to} | ${subject}`);
    return info;
  } catch (err) {
    // Log clearly but never crash the caller
    if (err.message?.includes('535') || err.message?.includes('BadCredentials')) {
      console.error('❌ SMTP auth failed. Check SMTP_USER / SMTP_PASS in .env');
    } else {
      console.error('❌ emailService error:', err.message);
    }
    throw err;
  }
};

// ─── Template helpers ─────────────────────────────────────────────────────────
const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const row = (label, value, shaded) =>
  `<tr style="background:${shaded ? '#f7f7f7' : '#ffffff'};">
     <td style="padding:10px 14px;font-weight:600;width:38%;color:#444;">${label}</td>
     <td style="padding:10px 14px;color:#222;">${value}</td>
   </tr>`;

// ─── Email 1: Client confirmation ─────────────────────────────────────────────
const clientConfirmationHtml = ({
  refId, guestName, packageName,
  fromDate, toDate,
  adults, children, infant,
}) => `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:30px 10px;">

  <table width="620" cellpadding="0" cellspacing="0"
         style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e0e0e0;">

    <!-- Header -->
    <tr>
      <td style="background:#1a1a2e;padding:28px 40px;text-align:center;">
        <h1 style="margin:0;color:#c9a84c;font-size:26px;letter-spacing:1px;">Vista Voyage</h1>
        <p style="margin:6px 0 0;color:#ccc;font-size:13px;">Luxury Travel Experiences</p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding:36px 40px;">
        <h2 style="color:#1a1a2e;margin-top:0;font-size:20px;">Booking Request Received ✅</h2>

        <p style="color:#333;font-size:15px;">Hello <strong>${guestName}</strong>,</p>
        <p style="color:#555;font-size:14px;line-height:1.7;">
          We have successfully received your booking request.
          Our team will send you a detailed quote within <strong>24 hours</strong>.
        </p>

        <!-- 24-hr callout -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
          <tr>
            <td style="background:#fff8e7;border-left:4px solid #c9a84c;
                        padding:14px 18px;border-radius:4px;
                        font-size:14px;font-weight:600;color:#7a5c00;">
              📬 Our team will send you a detailed quote within <strong>24 hours</strong>.
            </td>
          </tr>
        </table>

        <!-- Booking details table -->
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border-collapse:collapse;margin:24px 0;font-size:14px;
                      border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
          ${row('Booking Reference', `<span style="color:#c9a84c;font-weight:700;">${refId}</span>`, true)}
          ${row('Package',           packageName,        false)}
          ${row('Travel Dates',      `${fmt(fromDate)} &rarr; ${fmt(toDate)}`, true)}
          ${row('Adults',            adults,             false)}
          ${children > 0 ? row('Children', children, true)  : ''}
          ${infant   > 0 ? row('Infants',  infant,   false) : ''}
        </table>

        <p style="color:#555;font-size:14px;">
          If you have any immediate questions, simply reply to this email.
        </p>

        <!-- Signature -->
        <p style="margin-top:36px;color:#333;font-size:14px;">
          Kind regards,<br/>
          <strong>Vista Voyage Team</strong><br/>
          <span style="color:#999;font-size:12px;">
            ${process.env.SMTP_USER || ''}
          </span>
        </p>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background:#f9f9f9;padding:14px 40px;text-align:center;
                 border-top:1px solid #eee;font-size:11px;color:#bbb;">
        Vista Voyage &bull; Luxury Safaris &amp; Tours
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>`;

// ─── Email 2: Admin notification ──────────────────────────────────────────────
const adminNotificationHtml = ({
  refId, guestName, guestEmail, guestPhone,
  packageName, fromDate, toDate,
  adults, children, infant,
  message, timestamp,
}) => `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:30px 10px;">

  <table width="620" cellpadding="0" cellspacing="0"
         style="background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e0e0e0;">

    <!-- Header -->
    <tr>
      <td style="background:#c9a84c;padding:22px 40px;">
        <h2 style="margin:0;color:#fff;font-size:20px;">🔔 New Booking Request</h2>
        <p style="margin:4px 0 0;color:#fff3d4;font-size:13px;">Ref: <strong>${refId}</strong> &bull; ${timestamp}</p>
      </td>
    </tr>

    <tr>
      <td style="padding:30px 40px;">

        <!-- Client -->
        <p style="font-size:15px;font-weight:700;color:#1a1a2e;margin:0 0 12px;">Client Details</p>
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border-collapse:collapse;font-size:14px;
                      border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
          ${row('Name',           guestName,  true)}
          ${row('Email',          `<a href="mailto:${guestEmail}" style="color:#c9a84c;">${guestEmail}</a>`, false)}
          ${row('Phone/WhatsApp', guestPhone, true)}
        </table>

        <p style="font-size:15px;font-weight:700;color:#1a1a2e;margin:24px 0 12px;">Booking Details</p>
        <table width="100%" cellpadding="0" cellspacing="0"
               style="border-collapse:collapse;font-size:14px;
                      border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">
          ${row('Booking Reference', `<strong style="color:#c9a84c;">${refId}</strong>`, true)}
          ${row('Package',           packageName,  false)}
          ${row('Travel Dates',      `${fmt(fromDate)} &rarr; ${fmt(toDate)}`, true)}
          ${row('Adults',            adults,       false)}
          ${children > 0 ? row('Children', children, true)  : ''}
          ${infant   > 0 ? row('Infants',  infant,   false) : ''}
          ${row('Submitted At',      timestamp,    infant > 0 ? true : false)}
        </table>

        ${message ? `
        <p style="font-size:15px;font-weight:700;color:#1a1a2e;margin:24px 0 8px;">Client Message</p>
        <p style="background:#f9f9f9;padding:14px;border-radius:6px;
                  font-size:14px;color:#555;font-style:italic;margin:0;">
          ${message}
        </p>` : ''}

      </td>
    </tr>

    <tr>
      <td style="background:#f9f9f9;padding:14px 40px;text-align:center;
                 border-top:1px solid #eee;font-size:11px;color:#bbb;">
        Vista Voyage Admin Notification &bull; Do not reply to this email
      </td>
    </tr>

  </table>
</td></tr>
</table>
</body>
</html>`;

module.exports = { sendEmail, clientConfirmationHtml, adminNotificationHtml };
