const nodemailer = require('nodemailer');

// Create a more flexible transporter that supports local/maildev/mailpit (no-auth)
const createTransporter = () => {
  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  const isGmail = (host && host.includes('gmail')) || (user && user.includes('gmail'));

  if (isGmail) {
    const transport = { service: 'gmail' };
    if (user && pass) transport.auth = { user, pass };
    return nodemailer.createTransport(transport);
  }

  const transporterConfig = {
    host,
    port,
    secure: port === 465,
  };

  // If user/pass were provided, add auth. If not, leave auth off (Mailpit/MailHog often run without auth).
  if (user && pass) {
    transporterConfig.auth = { user, pass };
  }

  // If using a local testing SMTP (common ports 1025) or a provider name that indicates local
  // relax TLS settings so self-signed local servers work.
  const localHints = ['localhost', '127.0.0.1', 'mailpit', 'mailhog', 'maildev'];
  if (localHints.some(h => host && host.includes(h)) || port === 1025) {
    transporterConfig.secure = false;
    transporterConfig.tls = { rejectUnauthorized: false };
  }

  return nodemailer.createTransport(transporterConfig);
};

const transporter = createTransporter();

/**
 * Check if email configuration is valid or allowed for no-auth local SMTP
 * @returns {boolean}
 */
const isEmailConfigured = () => {
  const host = process.env.EMAIL_HOST || '';
  const port = parseInt(process.env.EMAIL_PORT, 10) || 0;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  // Allow sending without auth for local/dev SMTP servers (Mailpit, MailHog, MailDev)
  const allowNoAuth = process.env.EMAIL_ALLOW_NO_AUTH === 'true' ||
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    host.toLowerCase().includes('mailpit') ||
    host.toLowerCase().includes('mailhog') ||
    port === 1025;

  if (allowNoAuth) return true;

  if (!user || !pass ||
      user.includes('@example.com') ||
      user === 'your_email@gmail.com' ||
      pass === 'your_app_password_here' ||
      pass === 'INSERT_YOUR_16_CHARACTER_APP_PASSWORD_HERE' ||
      pass === '1234567890123456' ||
      pass === 'vista') {
    return false;
  }
  return true;
};

const sendEmail = async (options) => {
  if (!isEmailConfigured()) {
    const errorMsg = '⚠️ Email configuration incomplete: EMAIL_USER or EMAIL_PASS not correctly configured in .env';
    console.warn(errorMsg);
    return { skipped: true, message: errorMsg };
  }

  const fromAddress = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@vistavoyage.local';

  const mailOptions = {
    from: options.from || `"VistaVoyage" <${fromAddress}>`,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    replyTo: options.replyTo,
    attachments: options.attachments || [],
  };

  try {
    return await transporter.sendMail(mailOptions);
  } catch (error) {
    if (error && error.message && (error.message.includes('535-5.7.8') || error.message.includes('BadCredentials'))) {
      console.error('❌ GMAIL AUTHENTICATION ERROR: Your Gmail App Password is not accepted.');
      console.error('👉 ACTION REQUIRED: Go to https://myaccount.google.com/apppasswords and create a new 16-character App Password.');
      console.error('👉 THEN: Update EMAIL_PASS in your .env file with that password (without spaces).');
    } else {
      console.error('❌ Email Sending Error:', error && error.message ? error.message : error);
    }
    throw error;
  }
};

module.exports = { sendEmail };
