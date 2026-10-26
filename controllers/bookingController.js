const mongoose = require('mongoose');
const Booking  = require('../models/Booking');
const Tour     = require('../models/Tour');
const Activity = require('../models/Activity');
const Season   = require('../models/Season');
const { isValidObjectId } = require('../lib/sanitize');

const { generateQuotePDF } = require('../lib/pdfService');
const { sendWhatsApp }     = require('../lib/whatsapp');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

const toInt = (v, fallback = 0) => {
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : Math.max(0, n);
};

// ─── Valid workflow transitions ───────────────────────────────────────────────
const VALID_TRANSITIONS = {
  NEW:                  ['ASSIGNED', 'CANCELLED'],
  ASSIGNED:             ['QUOTE_SENT', 'CANCELLED'],
  QUOTE_SENT:           ['PENDING_CONFIRMATION', 'CANCELLED'],
  PENDING_CONFIRMATION: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:            ['COMPLETED', 'CANCELLED'],
  COMPLETED:            [],
  CANCELLED:            [],
};

// ─── Reference ID ─────────────────────────────────────────────────────────────
const generateReferenceId = async () => {
  const year   = new Date().getFullYear();
  const prefix = `VV-${year}-`;
  const last   = await Booking.findOne({ referenceId: { $regex: `^VV-${year}-` } })
    .sort({ createdAt: -1 }).select('referenceId').lean();
  const seq = last ? (parseInt(last.referenceId.replace(prefix, ''), 10) || 0) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

// ─── Seasonal price calculator ────────────────────────────────────────────────
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
    if (tourRate)                  { dayPrice = tourRate.price;  appliedSeasons.add(tourRate.season?.name || 'Special'); }
    else if (globalRate?.rate > 0) { dayPrice = globalRate.rate; appliedSeasons.add(globalRate.name); }

    totalBase += dayPrice;
  }

  return {
    price:          Math.round(totalBase * adults + totalBase * children * 0.75),
    appliedSeasons: [...appliedSeasons],
  };
};

// ─── CREATE BOOKING (public) ──────────────────────────────────────────────────
const createBooking = async (req, res) => {
  // Explicit allowlist — never trust sensitive fields from client
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
    travelStyle,
    travelDate,
    message     = '',
    totalPrice: clientPrice,
    metadata,
  } = req.body;

  // Validate required contact fields
  const missing = [];
  if (!guestName?.trim())  missing.push('guestName');
  if (!guestEmail?.trim()) missing.push('guestEmail');
  if (!guestPhone?.trim()) missing.push('guestPhone');
  if (missing.length) return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Validate type
  const VALID_TYPES = ['FLIGHT', 'APPOINTMENT', 'PACKAGE'];
  const bookingType = VALID_TYPES.includes(type) ? type : 'PACKAGE';

  try {
    let tour = null;
    if (mongoose.isValidObjectId(tourId)) {
      tour = await Tour.findById(tourId);
    } else if (tourId) {
      tour = await Tour.findOne({ slug: tourId });
    }

    const resolvedPackageName =
      bodyPackageName?.trim().slice(0, 200) ||
      (tour ? tour.title :
        bookingType === 'FLIGHT'      ? 'Flight Request' :
        bookingType === 'APPOINTMENT' ? 'Consultation'   : 'Exclusive Package');

    // Parse dates gracefully
    const parsedFrom = fromDate && !isNaN(new Date(fromDate).getTime()) ? new Date(fromDate) : undefined;
    const parsedTo   = toDate && !isNaN(new Date(toDate).getTime()) ? new Date(toDate) : parsedFrom;

    // Server-side price calculation
    let calculatedPrice = 0;
    let appliedSeasons  = [];
    if (tour && parsedFrom && parsedTo && toDate) {
      try {
        const result = await calculateTourPrice(tour._id, parsedFrom, parsedTo, toInt(guestsCount, 1), toInt(children));
        if (result.price > 0) { calculatedPrice = result.price; appliedSeasons = result.appliedSeasons; }
      } catch (e) { console.error('⚠️ Price calc failed:', e.message); }
    }

    if (!calculatedPrice && tour && tour.price) {
      calculatedPrice = (Number(tour.price) || 0) * toInt(guestsCount, 1) + Math.round((Number(tour.price) || 0) * toInt(children, 0) * 0.75);
    }
    if (!calculatedPrice && clientPrice) {
      calculatedPrice = Number(clientPrice) || 0;
    }

    const refId = await generateReferenceId();

    const booking = await Booking.create({
      referenceId:    refId,
      type:           bookingType,
      tour:           tour ? tour._id : (mongoose.isValidObjectId(tourId) ? tourId : null),
      tourId:         tourId ? String(tourId) : (tour ? String(tour._id) : undefined),
      packageName:    resolvedPackageName,
      fromDate:       parsedFrom,
      toDate:         parsedTo,
      travelDate:     String(travelDate || fromDate || ''),
      travelStyle:    String(travelStyle || req.body.style || tour?.travelStyle || ''),
      guestName:      String(guestName).trim().slice(0, 200),
      guestEmail:     String(guestEmail).trim().toLowerCase().slice(0, 200),
      guestPhone:     String(guestPhone).trim().slice(0, 50),
      guestsCount:    toInt(guestsCount, 1),
      children:       toInt(children),
      infant:         toInt(infant),
      message:        String(message).trim().slice(0, 2000),
      totalPrice:     calculatedPrice,
      // Server-controlled — never from client
      workflowStatus: 'NEW',
      quoteStatus:    'NOT_SENT',
      paymentStatus:  'UNPAID',
      status:         'PENDING',
      metadata: {
        appliedSeasons: appliedSeasons.length ? appliedSeasons : undefined,
        ...(metadata || {})
      },
    });

    res.status(201).json({ ...booking.toObject(), referenceId: refId });

    // Fire-and-forget side effects
    const io = req.app.get('io');
    if (io) {
      io.emit('newBooking', { bookingId: booking._id, referenceId: refId, guestName, packageName: resolvedPackageName });
      io.emit('statsUpdate');
    }

    Activity.create({
      action:   `New ${bookingType} Booking: ${refId}`,
      metadata: { bookingId: booking._id, guestName, refId },
    }).catch(e => console.error('❌ Activity log failed:', e.message));

    const adminWhatsApp = process.env.ADMIN_WHATSAPP || process.env.ADMIN_PHONE;
    if (adminWhatsApp) {
      const notifyText = `[${refId}] New ${bookingType} booking: ${resolvedPackageName}\nGuest: ${guestName} | ${guestPhone}\nDates: ${fmt(fromDate)} → ${fmt(toDate)}`;
      sendWhatsApp(adminWhatsApp, notifyText).catch(e => console.error('❌ WhatsApp failed:', e.message));
    }

  } catch (error) {
    console.error('❌ createBooking:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// ─── GET BOOKINGS (admin) ─────────────────────────────────────────────────────
const getBookings = async (req, res) => {
  try {
    const page  = Math.max(1, toInt(req.query.page, 1));
    const limit = Math.min(100, Math.max(1, toInt(req.query.limit, 50)));
    const skip  = (page - 1) * limit;

    const filter = {};
    const VALID_TYPES      = ['FLIGHT', 'APPOINTMENT', 'PACKAGE'];
    const VALID_WORKFLOWS  = ['NEW', 'ASSIGNED', 'QUOTE_SENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];

    if (req.query.type && VALID_TYPES.includes(req.query.type)) {
      filter.type = req.query.type;
    }
    if (req.query.workflowStatus && VALID_WORKFLOWS.includes(req.query.workflowStatus)) {
      filter.workflowStatus = req.query.workflowStatus;
    } else if (req.query.workflowStatuses) {
      const list = req.query.workflowStatuses.split(',').map(s => s.trim()).filter(s => VALID_WORKFLOWS.includes(s));
      if (list.length) filter.workflowStatus = { $in: list };
    }

    const countFilter = {};
    if (filter.type) countFilter.type = filter.type;

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
  } catch (error) {
    console.error('❌ getBookings:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// ─── UPDATE WORKFLOW STATUS (admin) ──────────────────────────────────────────
const updateWorkflowStatus = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid booking ID' });

  const { workflowStatus, details } = req.body;
  const VALID_WORKFLOWS = ['NEW', 'ASSIGNED', 'QUOTE_SENT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];
  if (!VALID_WORKFLOWS.includes(workflowStatus)) {
    return res.status(400).json({ message: 'Invalid workflow status' });
  }

  try {
    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const allowed = VALID_TRANSITIONS[booking.workflowStatus] || [];
    if (!allowed.includes(workflowStatus)) {
      return res.status(400).json({
        message: `Cannot transition from ${booking.workflowStatus} to ${workflowStatus}`,
      });
    }

    const oldStatus        = booking.workflowStatus;
    booking.workflowStatus = workflowStatus;

    if      (workflowStatus === 'QUOTE_SENT')  booking.quoteStatus = 'SENT';
    else if (workflowStatus === 'CONFIRMED')  { booking.status = 'CONFIRMED'; booking.quoteStatus = 'CONFIRMED'; }
    else if (workflowStatus === 'COMPLETED')    booking.status = 'CONFIRMED';
    else if (workflowStatus === 'CANCELLED')    booking.status = 'CANCELLED';

    booking.activityTimeline.push({
      action:    `Status → ${workflowStatus}`,
      details:   details ? String(details).trim().slice(0, 500) : `Changed from ${oldStatus} to ${workflowStatus}`,
      performer: req.user?.id,
    });

    await booking.save();

    Activity.create({
      action:   'BOOKING_STATUS_CHANGED',
      metadata: { bookingId: id, oldStatus, newStatus: workflowStatus, actor: req.user?.id },
    }).catch(() => {});

    const updated = await Booking.findById(id)
      .populate('assignedWorkers', 'name role email status')
      .populate('tour');
    const io = req.app.get('io');
    if (io) io.emit('bookingUpdated', updated);
    res.json(updated);
  } catch (error) {
    console.error('❌ updateWorkflowStatus:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// ─── ASSIGN WORKERS (admin) ───────────────────────────────────────────────────
const assignWorkers = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid booking ID' });

  const { workerIds } = req.body;
  if (!Array.isArray(workerIds)) return res.status(400).json({ message: 'workerIds must be an array' });

  const validIds = workerIds.filter(w => isValidObjectId(w));

  try {
    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    booking.assignedWorkers = validIds;
    if (booking.workflowStatus === 'NEW' && validIds.length > 0) {
      booking.workflowStatus = 'ASSIGNED';
      booking.activityTimeline.push({ action: 'Status → ASSIGNED', details: 'Auto-transitioned on worker assignment', performer: req.user?.id });
    }
    booking.activityTimeline.push({ action: 'Workers Assigned', details: `Assigned ${validIds.length} executive(s)`, performer: req.user?.id });
    await booking.save();

    Activity.create({
      action:   'BOOKING_ASSIGNED',
      metadata: { bookingId: id, workerCount: validIds.length, actor: req.user?.id },
    }).catch(() => {});

    const updated = await Booking.findById(id).populate('assignedWorkers', 'name role email status').populate('tour');
    const io = req.app.get('io');
    if (io) io.emit('bookingUpdated', updated);
    res.json(updated);
  } catch (error) {
    console.error('❌ assignWorkers:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// ─── SEND QUOTE (admin) ───────────────────────────────────────────────────────
const sendBookingQuote = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid booking ID' });

  const { quote, expiresAt } = req.body;
  if (!quote?.trim()) return res.status(400).json({ message: 'Quote text is required' });

  try {
    const booking = await Booking.findById(id).populate('tour');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const tourTitle = booking.packageName || booking.tour?.title || 'Exclusive Package';
    // Server-generated filename — never from client
    const filename  = `quote_${id}_${Date.now()}.pdf`;

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
      quoteText:   String(quote).trim().slice(0, 5000),
      expiresAt,
      // Use authenticated staff name — never trust client-supplied quotedBy
      quotedBy:    req.user ? `${req.user.email}` : undefined,
    }, filename);

    booking.quote          = String(quote).trim().slice(0, 5000);
    booking.quotedBy       = req.user?.id || undefined;
    booking.quoteExpiresAt = expiresAt ? new Date(expiresAt) : undefined;
    booking.quotePdfPath   = pdfPath;
    booking.quoteStatus    = 'SENT';
    booking.workflowStatus = 'QUOTE_SENT';
    booking.activityTimeline.push({
      action:    'Status → QUOTE_SENT',
      details:   `Quote sent. Expiry: ${expiresAt || 'N/A'}`,
      performer: req.user?.id,
    });
    await booking.save();

    Activity.create({
      action:   'BOOKING_QUOTE_SENT',
      metadata: { bookingId: id, actor: req.user?.id },
    }).catch(() => {});

    const updated = await Booking.findById(id).populate('assignedWorkers', 'name role email status').populate('tour');
    const io = req.app.get('io');
    if (io) io.emit('bookingUpdated', updated);
    res.json(updated);
  } catch (error) {
    console.error('❌ sendBookingQuote:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// ─── QUOTE PRICE PREVIEW (public) ────────────────────────────────────────────
const getQuotePrice = async (req, res) => {
  const { tourId, fromDate, toDate, adults, children } = req.query;
  try {
    const result = await calculateTourPrice(tourId, fromDate, toDate, toInt(adults, 1), toInt(children));
    if (result.price === 0)
      return res.json({ price: null, message: 'Seasonal pricing only available for DB-managed packages' });
    res.json(result);
  } catch (error) {
    console.error('❌ getQuotePrice:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

// ─── INTERNAL NOTE (admin) ────────────────────────────────────────────────────
const addInternalNote = async (req, res) => {
  const { id } = req.params;
  if (!isValidObjectId(id)) return res.status(400).json({ message: 'Invalid booking ID' });

  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ message: 'Note text is required' });

  try {
    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    booking.internalNotes.push({
      text:   String(text).trim().slice(0, 2000),
      author: req.user?.id,
    });
    await booking.save();

    Activity.create({
      action:   'INTERNAL_NOTE_CREATED',
      metadata: { bookingId: id, actor: req.user?.id },
    }).catch(() => {});

    const updated = await Booking.findById(id)
      .populate('internalNotes.author', 'name role')
      .populate('assignedWorkers', 'name role email status');
    res.json(updated);
  } catch (error) {
    console.error('❌ addInternalNote:', error.message);
    res.status(500).json({ error: 'An unexpected error occurred' });
  }
};

module.exports = {
  createBooking, getBookings, sendBookingQuote,
  getQuotePrice, assignWorkers, updateWorkflowStatus, addInternalNote,
};
