const mongoose = require('mongoose');
const Booking  = require('../models/Booking');
const Tour     = require('../models/Tour');
const Activity = require('../models/Activity');
const Season   = require('../models/Season');

const { sendEmail, clientConfirmationHtml, adminNotificationHtml } = require('../lib/emailService');
const { generateQuotePDF } = require('../lib/pdfService');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

const toInt = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
};

// ─── Reference ID: VV-2026-0001 ───────────────────────────────────────────────
const generateReferenceId = async () => {
  const year   = new Date().getFullYear();
  const prefix = `VV-${year}-`;
  const last   = await Booking.findOne({ referenceId: { $regex: `^${prefix}` } })
    .sort({ createdAt: -1 })
    .select('referenceId')
    .lean();
  const seq = last ? (parseInt(last.referenceId.replace(prefix, ''), 10) || 0) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

// ─── Seasonal price calculator ─────────────────────────────────────────────────
const calculateTourPrice = async (tourId, fromDate, toDate, adults = 1, children = 0) => {
  const tour = mongoose.isValidObjectId(tourId)
    ? await Tour.findById(tourId).populate('seasonalPrices.season')
    : null;

  if (!tour) return { price: 0, appliedSeasons: [] };

  const start    = new Date(fromDate); start.setHours(0, 0, 0, 0);
  const end      = new Date(toDate);   end.setHours(0, 0, 0, 0);
  const diffDays = Math.max(1, Math.ceil(Math.abs(end - start) / 86400000));

  const globalSeasons  = await Season.find();
  let totalBase        = 0;
  const appliedSeasons = new Set();

  for (let i = 0; i < diffDays; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);

    const tourRate = tour.seasonalPrices.find(sp => {
      if (!sp.season) return false;
      const s = new Date(sp.season.startDate); s.setHours(0, 0, 0, 0);
      const e = new Date(sp.season.endDate);   e.setHours(0, 0, 0, 0);
      return day >= s && day <= e;
    });

    const globalRate = !tourRate ? globalSeasons.find(gs => {
      const s = new Date(gs.startDate); s.setHours(0, 0, 0, 0);
      const e = new Date(gs.endDate);   e.setHours(0, 0, 0, 0);
      return day >= s && day <= e;
    }) : null;

    let dayPrice = tour.price;
    if (tourRate)                    { dayPrice = tourRate.price;  appliedSeasons.add(tourRate.season?.name || 'Special'); }
    else if (globalRate?.rate > 0)   { dayPrice = globalRate.rate; appliedSeasons.add(globalRate.name); }

    totalBase += dayPrice;
  }

  return {
    price:          Math.round(totalBase * adults + totalBase * children * 0.75),
    appliedSeasons: [...appliedSeasons],
  };
};

// ─── CREATE BOOKING ───────────────────────────────────────────────────────────
const createBooking = async (req, res) => {
  const {
    type        = 'PACKAGE',
    tourId,
    packageName: bodyPackageName,
    fromDate,
    toDate,
    guestName,
    guestEmail,
    guestPhone,
    guestsCount,
    children    = 0,
    infant      = 0,
    message     = '',
    totalPrice,
    metadata,
  } = req.body;

  // ── 1. Validate ──────────────────────────────────────────────────────────────
  const missing = [];
  if (!guestName)  missing.push('guestName');
  if (!guestEmail) missing.push('guestEmail');
  if (!guestPhone) missing.push('guestPhone');
  if (!fromDate)   missing.push('fromDate');
  if (!toDate)     missing.push('toDate');

  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
  }

  try {
    // ── 2. Resolve tour & package name ─────────────────────────────────────────
    const tour = mongoose.isValidObjectId(tourId) ? await Tour.findById(tourId) : null;
    const resolvedPackageName =
      bodyPackageName ||
      (tour ? tour.title :
        type === 'FLIGHT'      ? 'Flight Request' :
        type === 'APPOINTMENT' ? 'Consultation'   : 'Exclusive Package');

    // ── 3. Calculate price ─────────────────────────────────────────────────────
    let calculatedPrice  = totalPrice || 0;
    let appliedSeasons   = [];
    if (tour && fromDate && toDate) {
      try {
        const result = await calculateTourPrice(tourId, fromDate, toDate, toInt(guestsCount, 1), toInt(children));
        if (result.price > 0) { calculatedPrice = result.price; appliedSeasons = result.appliedSeasons; }
      } catch (e) { console.error('⚠️ Price calc failed:', e.message); }
    }

    // ── 4. Generate reference ID ───────────────────────────────────────────────
    const refId = await generateReferenceId();

    // ── 5. Save to DB FIRST ────────────────────────────────────────────────────
    const booking = await Booking.create({
      referenceId:  refId,
      type,
      tour:         mongoose.isValidObjectId(tourId) ? tourId : null,
      tourId:       !mongoose.isValidObjectId(tourId) ? tourId : undefined,
      packageName:  resolvedPackageName,
      fromDate:     new Date(fromDate),
      toDate:       new Date(toDate),
      guestName,
      guestEmail,
      guestPhone,
      guestsCount:  toInt(guestsCount, 1),
      children:     toInt(children),
      infant:       toInt(infant),
      message,
      totalPrice:   calculatedPrice,
      workflowStatus: 'NEW',
      quoteStatus:    'NOT_SENT',
      metadata: { ...metadata, appliedSeasons: appliedSeasons.length ? appliedSeasons : undefined },
    });

    console.log(`✅ Booking saved: ${refId}`);

    // ── 6. Socket.io — emit newBooking with exact required payload ─────────────
    const io = req.app.get('io');
    if (io) {
      io.emit('newBooking', {
        bookingId:   booking._id,
        referenceId: refId,
        guestName,
        packageName: resolvedPackageName,
      });
      io.emit('statsUpdate');
    }

    // ── 7. Activity log ────────────────────────────────────────────────────────
    await Activity.create({
      action:   `New ${type} Booking: ${refId}`,
      metadata: { bookingId: booking._id, guestName, refId },
    });

    // ── 8. Build shared email data ─────────────────────────────────────────────
    const emailData = {
      refId,
      guestName,
      guestEmail,
      guestPhone,
      packageName:  resolvedPackageName,
      fromDate,
      toDate,
      adults:    toInt(guestsCount, 1),
      children:  toInt(children),
      infant:    toInt(infant),
      message,
      timestamp: new Date().toLocaleString('en-GB', { timeZone: 'Africa/Nairobi' }),
    };

    // ── 9. Client confirmation email ───────────────────────────────────────────
    sendEmail({
      to:      guestEmail,
      subject: `We've Received Your Booking Request – ${refId}`,
      html:    clientConfirmationHtml(emailData),
    }).catch(e => console.error('❌ Client email failed:', e.message));

    // ── 10. Admin notification email ───────────────────────────────────────────
    const adminEmail = process.env.ADMIN_EMAIL || process.env.COMPANY_EMAIL || 'otienoeric374@gmail.com';
    sendEmail({
      to:      adminEmail,
      replyTo: guestEmail,
      subject: `New Booking Request Received – ${resolvedPackageName} [${refId}]`,
      html:    adminNotificationHtml(emailData),
    }).catch(e => console.error('❌ Admin email failed:', e.message));

    // ── 10.5. Admin SMS notification ───────────────────────────────────────────
    const adminPhone = process.env.ADMIN_PHONE;
    if (adminPhone) {
      const { sendSMS } = require('../lib/sms');
      const smsText = `[${refId}] New quote request: ${resolvedPackageName}\nFrom: ${guestName} | ${guestPhone}\nDates: ${fmt(fromDate)} → ${fmt(toDate)}\nGuests: ${toInt(guestsCount, 1)}`;
      sendSMS(adminPhone, smsText).catch(e => console.error('❌ Admin SMS failed:', e.message));
    }

    // ── 11. Return success ─────────────────────────────────────────────────────
    res.status(201).json({ ...booking.toObject(), referenceId: refId });

  } catch (error) {
    console.error('❌ createBooking:', error);
    res.status(500).json({ error: error.message });
  }
};

// ─── GET BOOKINGS ─────────────────────────────────────────────────────────────
const getBookings = async (req, res) => {
  try {
    const page  = Math.max(1, toInt(req.query.page,  1));
    const limit = Math.min(500, Math.max(1, toInt(req.query.limit, 100)));
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.type)           filter.type = req.query.type;
    if (req.query.workflowStatus) {
      filter.workflowStatus = req.query.workflowStatus;
    } else if (req.query.workflowStatuses) {
      const list = req.query.workflowStatuses.split(',').map(s => s.trim()).filter(Boolean);
      if (list.length) filter.workflowStatus = { $in: list };
    }

    const countFilter = {};
    if (req.query.type) countFilter.type = req.query.type;

    const [bookings, total, scopeTotal, statusAgg] = await Promise.all([
      Booking.find(filter)
        .populate('tour')
        .populate('confirmedBy',          'name role')
        .populate('quotedBy',             'name role')
        .populate('respondedBy',          'name role')
        .populate('assignedWorkers',      'name role email status')
        .populate('internalNotes.author', 'name role')
        .sort({ createdAt: -1 })
        .skip(skip).limit(limit).lean(),
      Booking.countDocuments(filter),
      Booking.countDocuments(countFilter),
      Booking.aggregate([{ $match: countFilter }, { $group: { _id: '$workflowStatus', n: { $sum: 1 } } }]),
    ]);

    res.json({
      data:       bookings,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), scopeTotal },
      workflowCounts: Object.fromEntries(statusAgg.map(x => [x._id || 'UNKNOWN', x.n])),
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

// ─── UPDATE WORKFLOW STATUS ───────────────────────────────────────────────────
const updateWorkflowStatus = async (req, res) => {
  const { id } = req.params;
  const { workflowStatus, details } = req.body;
  try {
    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const oldStatus      = booking.workflowStatus;
    booking.workflowStatus = workflowStatus;

    // Side-effects on status transition
    if      (workflowStatus === 'QUOTE_SENT')  booking.quoteStatus = 'SENT';
    else if (workflowStatus === 'CONFIRMED')  { booking.status = 'CONFIRMED'; booking.quoteStatus = 'CONFIRMED'; }
    else if (workflowStatus === 'COMPLETED')    booking.status = 'CONFIRMED';
    else if (workflowStatus === 'CANCELLED')    booking.status = 'CANCELLED';

    // Auto-append timeline entry
    booking.activityTimeline.push({
      action:  `Status → ${workflowStatus}`,
      details: details || `Changed from ${oldStatus} to ${workflowStatus}`,
    });

    await booking.save();
    await Activity.create({ action: 'Status Updated', metadata: { bookingId: id, oldStatus, newStatus: workflowStatus, guestName: booking.guestName } });

    const updated = await Booking.findById(id).populate('assignedWorkers', 'name role email status').populate('tour');
    const io = req.app.get('io');
    if (io) io.emit('bookingUpdated', updated);
    res.json(updated);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

// ─── ASSIGN WORKERS ───────────────────────────────────────────────────────────
const assignWorkers = async (req, res) => {
  const { id } = req.params;
  const { workerIds } = req.body;
  try {
    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    booking.assignedWorkers = workerIds;
    if (booking.workflowStatus === 'NEW' && workerIds.length > 0) {
      booking.workflowStatus = 'ASSIGNED';
      booking.activityTimeline.push({ action: 'Status → ASSIGNED', details: 'Auto-transitioned on worker assignment' });
    }
    booking.activityTimeline.push({ action: 'Workers Assigned', details: `Assigned ${workerIds.length} executive(s)` });
    await booking.save();

    await Activity.create({ action: 'Workers Assigned', metadata: { bookingId: id, workerCount: workerIds.length, guestName: booking.guestName } });

    const updated = await Booking.findById(id).populate('assignedWorkers', 'name role email status').populate('tour');
    const io = req.app.get('io');
    if (io) io.emit('bookingUpdated', updated);
    res.json(updated);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

// ─── SEND QUOTE ───────────────────────────────────────────────────────────────
const sendBookingQuote = async (req, res) => {
  const { id } = req.params;
  const { quote, expiresAt, quotedBy } = req.body;
  try {
    const booking = await Booking.findById(id).populate('tour');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const tourTitle = booking.packageName || booking.tour?.title || 'Exclusive Package';
    const filename  = `quote_${id}_${Date.now()}.pdf`;

    // Generate branded PDF
    const pdfPath = await generateQuotePDF({
      refId:       booking.referenceId || String(booking._id),
      guestName:   booking.guestName,
      guestEmail:  booking.guestEmail,
      guestPhone:  booking.guestPhone,
      packageName: tourTitle,
      fromDate:    booking.fromDate,
      toDate:      booking.toDate,
      adults:      booking.guestsCount,
      children:    booking.children,
      infant:      booking.infant,
      quoteText:   quote,
      expiresAt,
      quotedBy,
    }, filename);

    // Update booking record
    booking.quote           = quote;
    booking.quotedBy        = quotedBy || undefined;
    booking.quoteExpiresAt  = expiresAt ? new Date(expiresAt) : undefined;
    booking.quotePdfPath    = pdfPath;
    booking.quoteStatus     = 'SENT';
    booking.workflowStatus  = 'QUOTE_SENT';
    booking.activityTimeline.push({ action: 'Status → QUOTE_SENT', details: `Quote sent. Expiry: ${expiresAt || 'N/A'}` });
    await booking.save();

    await Activity.create({ action: 'Sent Booking Quote', metadata: { bookingId: id, guestName: booking.guestName } });

    // Email quote + PDF to client
    await sendEmail({
      to:      booking.guestEmail,
      subject: `Your Vista Voyage Quotation – ${booking.referenceId || booking._id}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;
                    padding:30px;border:1px solid #eee;border-radius:10px;">
          <h2 style="color:#c9a84c;margin-top:0;">Your Official Quotation</h2>
          <p>Dear ${booking.guestName},</p>
          <p>Please find your quotation for <strong>${tourTitle}</strong> attached to this email.</p>
          <div style="background:#f9f9f9;padding:20px;border-radius:8px;margin:20px 0;
                      font-size:14px;line-height:1.7;">
            ${quote}
            ${expiresAt ? `<p style="margin-top:14px;color:#7a5c00;font-weight:600;">
              ⏳ Valid until: ${new Date(expiresAt).toLocaleDateString('en-GB')}
            </p>` : ''}
          </div>
          <p>Reply to this email to confirm or ask questions.</p>
          <p style="margin-top:28px;">Kind regards,<br/><strong>Vista Voyage Team</strong></p>
        </div>`,
      attachments: [{ filename: `quote_${booking.referenceId || booking._id}.pdf`, path: pdfPath }],
    });

    const updated = await Booking.findById(id).populate('assignedWorkers', 'name role email status').populate('tour');
    const io = req.app.get('io');
    if (io) io.emit('bookingUpdated', updated);
    res.json(updated);
  } catch (error) {
    console.error('❌ sendBookingQuote:', error.message);
    res.status(500).json({ error: error.message });
  }
};

// ─── QUOTE PRICE (preview) ────────────────────────────────────────────────────
const getQuotePrice = async (req, res) => {
  const { tourId, fromDate, toDate, adults, children } = req.query;
  try {
    const result = await calculateTourPrice(tourId, fromDate, toDate, toInt(adults, 1), toInt(children));
    if (result.price === 0)
      return res.json({ price: null, message: 'Seasonal pricing only available for DB-managed packages' });
    res.json(result);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

// ─── INTERNAL NOTE ────────────────────────────────────────────────────────────
const addInternalNote = async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  try {
    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    booking.internalNotes.push({ text });
    await booking.save();
    const updated = await Booking.findById(id)
      .populate('internalNotes.author', 'name role')
      .populate('assignedWorkers', 'name role email status');
    res.json(updated);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

module.exports = {
  createBooking,
  getBookings,
  sendBookingQuote,
  getQuotePrice,
  assignWorkers,
  updateWorkflowStatus,
  addInternalNote,
};
