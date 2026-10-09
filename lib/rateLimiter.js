const rateLimit = require('express-rate-limit');

// ── Auth: very strict — 10 attempts per 15 min ────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' },
  skipSuccessfulRequests: true,
});

// ── Public forms: 20 per 10 min (contact, booking, appointment) ───────────────
const publicFormLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
});

// ── File uploads: 10 per 10 min ───────────────────────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many uploads. Please try again later.' },
});

// ── General API: 200 per 15 min ───────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please try again later.' },
});

module.exports = { authLimiter, publicFormLimiter, uploadLimiter, generalLimiter };
