const nodemailer = require('nodemailer');

// ── Lazy transporter: created on first send, not at module load ───────────────
// This ensures process.env values are fully loaded before we read them.
let _transporter = null;

const getTransporter = () => {
  if (_transporter) return _transporter;

  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  const isGmail = host.includes('gmail') || (user && user.includes('gmail'));

  if (isGmail) {
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass }
    });
    return _transporter;
  }

  const config = {
    host,
    port,
    secure: port === 465,   // true for 465, false for 587 (STARTTLS)
  };

  if (user && pass) config.auth = { user, pass };

  // Local dev SMTP (Mailpit / MailHog) — no TLS required
  const localHints = ['localhost', '127.0.0.1', 'mailpit', 'mailhog', 'maildev'];
  if (localHints.some(h => host.includes(h)) || port === 1025) {
    config.secure = false;
    config.tls = { rejectUnauthorized: false };
  }

  _transporter = nodemailer.createTransport(config);
  return _transporter;
};

// ── Guard: skip sending if credentials are clearly placeholder values ─────────
const isEmailConfigured = () => {
  const host = process.env.EMAIL_HOST || '';
  const port = parseInt(process.env.EMAIL_PORT, 10) || 0;
  const user = process.env.EMAIL_USER || '';
  const pass = process.env.EMAIL_PASS || '';

  // Allow no-auth for local dev servers
  const localHints = ['localhost', '127.0.0.1', 'mailpit', 'mailhog', 'maildev'];
  const isLocal = localHints.some(h => host.includes(h)) || port === 1025;
  if (isLocal || process.env.EMAIL_ALLOW_NO_AUTH === 'true') return true;

  const placeholders = [
    '', 'your_email@gmail.com', 'youremail@gmail.com',
    'your-email@example.com', 'your_email@example.com',
    'your_app_password_here', 'your-email-app-password',
    'INSERT_YOUR_16_CHARACTER_APP_PASSWORD_HERE',
    '1234567890123456', 'vista'
  ];

  return !placeholders.includes(user) && !placeholders.includes(pass);
};

// ── Main send function ────────────────────────────────────────────────────────
const sendEmail = async ({ to, from, subject, html, text, replyTo, attachments = [] }) => {
  if (!isEmailConfigured()) {
    console.warn('⚠️  Email skipped — EMAIL_USER / EMAIL_PASS not configured in .env');
    return { skipped: true };
  }

  const companyName = process.env.COMPANY_NAME || 'VistaVoyage Travel';
  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  try {
    const result = await getTransporter().sendMail({
      from:        from || `"${companyName}" <${fromAddress}>`,
      to,
      subject,
      html,
      text,
      replyTo,
      attachments,
    });
    console.log(`📧 Email sent → ${to} | ${subject}`);
    return result;
  } catch (err) {
    if (err.message?.includes('535-5.7.8') || err.message?.includes('BadCredentials')) {
      console.error('❌ Gmail auth failed — generate a new App Password at https://myaccount.google.com/apppasswords');
      console.error('   Then update EMAIL_PASS in your .env (no spaces in the password)');
    } else {
      console.error('❌ Email send error:', err.message);
    }
    throw err;
  }
};

module.exports = { sendEmail };
