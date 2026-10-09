/**
 * Escape user-supplied strings before inserting into HTML email templates.
 * Prevents HTML/script injection through contact forms, booking messages, etc.
 */
const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
};

/**
 * Validate a MongoDB ObjectId string.
 */
const isValidObjectId = (id) => {
  return /^[a-f\d]{24}$/i.test(String(id));
};

/**
 * Validate an email address format.
 */
const isValidEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
};

/**
 * Strip any characters that could be used for path traversal.
 */
const sanitizeFilename = (name) => {
  return String(name || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
};

module.exports = { escapeHtml, isValidObjectId, isValidEmail, sanitizeFilename };
