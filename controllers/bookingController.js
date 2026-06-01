const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Tour = require('../models/Tour');
const Activity = require('../models/Activity');
const { sendEmail } = require('../lib/email');
const { sendSMS } = require('../lib/sms');
const { generateQuotePDF } = require('../lib/pdfGenerator');
const path = require('path');
const Season = require('../models/Season');

const calculateTourPrice = async (tourId, fromDate, toDate, adults = 1, children = 0) => {
  let tour = null;
  if (mongoose.isValidObjectId(tourId)) {
    tour = await Tour.findById(tourId).populate('seasonalPrices.season');
  }
  
  // If tour not in DB, we can't do seasonal pricing, use a reasonable default or throw
  // But let's check if we have a fallback price from the request if needed
  if (!tour) {
    console.log(`⚠️ Tour ${tourId} not found in DB, using static calculation`);
    // Fallback: search in static tours if possible, or just return a base calculation
    return 0; // The controller will handle the fallback
  }

  const start = new Date(fromDate);
  const end = new Date(toDate);
  
  // Normalize dates to midnight UTC for accurate comparison
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  // Fetch all global seasons to check against
  const globalSeasons = await Season.find();

  // Calculate total nights (minimum 1)
  const diffTime = Math.abs(end - start);
  const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  
  console.log(`🔍 Calculating price for ${diffDays} days. Base price: ${tour.price}`);
  
  let totalBasePrice = 0;
  let appliedSeasons = [];
  
  for (let i = 0; i < diffDays; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(currentDate.getDate() + i);
    
    // 1. Check for specific tour seasonal prices (overrides global)
    const tourSeasonRate = tour.seasonalPrices.find(sp => {
      if (!sp.season) return false;
      const sDate = new Date(sp.season.startDate);
      const eDate = new Date(sp.season.endDate);
      sDate.setHours(0, 0, 0, 0);
      eDate.setHours(0, 0, 0, 0);
      return currentDate >= sDate && currentDate <= eDate;
    });

    // 2. Check for global seasons if no tour-specific season is found
    const globalSeason = !tourSeasonRate ? globalSeasons.find(gs => {
      const sDate = new Date(gs.startDate);
      const eDate = new Date(gs.endDate);
      sDate.setHours(0, 0, 0, 0);
      eDate.setHours(0, 0, 0, 0);
      return currentDate >= sDate && currentDate <= eDate;
    }) : null;
    
    let dayPrice = tour.price;
    if (tourSeasonRate) {
      dayPrice = tourSeasonRate.price;
      appliedSeasons.push(tourSeasonRate.season?.name || 'Special Season');
      console.log(`✨ Day ${i+1} (${currentDate.toDateString()}): Tour-Specific Seasonal Rate applied: ${dayPrice}`);
    } else if (globalSeason && globalSeason.rate > 0) {
      dayPrice = globalSeason.rate;
      appliedSeasons.push(globalSeason.name);
      console.log(`🌍 Day ${i+1} (${currentDate.toDateString()}): Global Seasonal Rate (${globalSeason.name}) applied: ${dayPrice}`);
    }

    totalBasePrice += dayPrice;
  }

  const adultsTotal = totalBasePrice * adults;
  const childrenTotal = totalBasePrice * children * 0.75; // Children at 75%
  
  const finalPrice = Math.round(adultsTotal + childrenTotal);
  console.log(`✅ Final calculated price: ${finalPrice}`);
  return { 
    price: finalPrice, 
    appliedSeasons: appliedSeasons.length > 0 ? Array.from(new Set(appliedSeasons)) : [] 
  };
};

const sendBookingQuote = async (req, res) => {
  const { id } = req.params;
  const { quote, expiresAt } = req.body;

  try {
    console.log(`🔨 Sending quote for booking: ${id}`);

    const booking = await Booking.findById(id).populate('tour');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    // Generate PDF
    const filename = `quote_${id}_${Date.now()}.pdf`;
    const pdfPath = await generateQuotePDF({
      id: booking._id,
      name: booking.guestName,
      email: booking.guestEmail,
      phone: booking.guestPhone,
      tourTitle: booking.tour ? booking.tour.title : (booking.type === 'FLIGHT' ? 'Flight Request' : (booking.type === 'APPOINTMENT' ? 'Consultation' : 'Exclusive Package')),
      location: booking.tour ? booking.tour.location : 'N/A',
      duration: booking.tour ? `${booking.tour.duration} days` : 'N/A',
      quote: quote,
      expiresAt: expiresAt
    }, filename);

    // Update booking
    booking.quote = quote;
    booking.quoteExpiresAt = expiresAt ? new Date(expiresAt) : undefined;
    booking.quotePdfPath = pdfPath;
    booking.quoteStatus = 'SENT';
    booking.workflowStatus = 'QUOTE_SENT';

    booking.activityTimeline.push({
      action: 'Quote Sent',
      details: `Quote sent to client with expiry: ${expiresAt || 'N/A'}`,
    });

    await booking.save();

    await Activity.create({
      action: 'Sent Booking Quote',
      metadata: { bookingId: id, guestName: booking.guestName }
    });

    // Send Email
    await sendEmail({
      to: booking.guestEmail,
      subject: `Your VistaVoyage Quotation - ${booking._id}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #B8860B; border-bottom: 2px solid #B8860B; padding-bottom: 10px;">Your Official Quotation</h2>
          <p>Dear ${booking.guestName},</p>
          <p>Please find attached your official quotation for your upcoming journey with <strong>VistaVoyage</strong>.</p>
          
          <div style="background: #f9f9f9; padding: 20px; border-radius: 10px; margin: 20px 0;">
            <p><strong>Quote Details:</strong></p>
            <p>${quote}</p>
            ${expiresAt ? `<p><strong>Valid Until:</strong> ${new Date(expiresAt).toLocaleDateString()}</p>` : ''}
          </div>

          <p>To proceed with this booking, please contact your travel consultant or reply to this email.</p>
          <p>Best regards,<br/>The VistaVoyage Team</p>
        </div>
      `
    });

    const updatedBooking = await Booking.findById(id)
      .populate('assignedWorkers', 'name role email status')
      .populate('tour');

    // Emit real-time update
    const io = req.app.get('io');
    if (io) io.emit('bookingUpdated', updatedBooking);

    res.json(updatedBooking);
  } catch (error) {
    console.error('❌ Error in sendBookingQuote:', error.message);
    res.status(500).json({ error: error.message });
  }
};

const getQuotePrice = async (req, res) => {
  const { tourId, fromDate, toDate, adults, children } = req.query;
  try {
    const { price } = await calculateTourPrice(tourId, fromDate, toDate, parseInt(adults), parseInt(children));
    if (price === 0) {
      return res.json({ price: null, message: 'Seasonal pricing only available for database-managed packages' });
    }
    res.json({ price });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createBooking = async (req, res) => {
  const { 
    type = 'PACKAGE',
    tourId, 
    fromDate, 
    toDate, 
    guestName, 
    guestEmail, 
    guestPhone, 
    guestsCount, 
    totalPrice,
    metadata
  } = req.body;

  try {
    console.log('📬 Received booking request:', { type, tourId, guestName });
    const tour = mongoose.isValidObjectId(tourId) ? await Tour.findById(tourId) : null;
    
    let calculatedPrice = totalPrice;
    let appliedSeasons = [];
    if (tour && fromDate && toDate) {
      try {
        const result = await calculateTourPrice(
          tourId, 
          fromDate, 
          toDate, 
          metadata?.adults || 1, 
          metadata?.children || 0
        );
        calculatedPrice = result.price;
        appliedSeasons = result.appliedSeasons;
        console.log('💰 Dynamic price calculated:', calculatedPrice);
      } catch (priceError) {
        console.error('⚠️ Price calculation failed, using provided price:', priceError.message);
      }
    }

    const booking = new Booking({
      type,
      tour: mongoose.isValidObjectId(tourId) ? tourId : null,
      tourId: !mongoose.isValidObjectId(tourId) ? tourId : undefined,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      guestName,
      guestEmail,
      guestPhone,
      guestsCount: guestsCount ? parseInt(guestsCount) : 1,
      totalPrice: calculatedPrice || totalPrice || 0,
      metadata: {
        ...metadata,
        appliedSeasons: appliedSeasons.length > 0 ? appliedSeasons : undefined
      }
    });

    await booking.save();
    console.log('✅ Booking created and saved to DB:', booking._id);

    // Log Activity
    await Activity.create({
      staffId: '69afebec0f41af541cb76f18', // Default system admin ID for guest actions
      action: `New ${type} Booking Received`,
      metadata: { bookingId: booking._id, guestName: booking.guestName, type }
    });

    // Emit real-time update
    const io = req.app.get('io');
    if (io) {
      io.emit('newBooking', booking);
      io.emit('statsUpdate');
    }

    const tourTitle = tour ? tour.title : (type === 'FLIGHT' ? 'Flight Request' : (type === 'APPOINTMENT' ? 'Consultation' : 'Exclusive Package'));

    // Send Client Receipt Email
    if (guestEmail) {
      try {
        await sendEmail({
          to: guestEmail,
          subject: `Request Received: ${tourTitle}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
              <h2 style="color: #B8860B; border-bottom: 2px solid #B8860B; padding-bottom: 10px;">Request Received</h2>
              <p>Dear ${guestName},</p>
              <p>Thank you for choosing <strong>VistaVoyage</strong>.</p>
              <p>Our luxury travel consultants will contact you within 24 hours to finalize your booking for <strong>${tourTitle}</strong>.</p>
              
              <div style="background: #f9f9f9; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <p><strong>Request Type:</strong> ${type}</p>
                <p><strong>Reference ID:</strong> ${booking._id}</p>
                ${fromDate ? `<p><strong>Dates:</strong> ${new Date(fromDate).toDateString()} ${toDate ? `to ${new Date(toDate).toDateString()}` : ''}</p>` : ''}
                ${guestsCount ? `<p><strong>Guests:</strong> ${guestsCount}</p>` : ''}
              </div>

              <p>If you have any immediate questions, please feel free to reply to this email.</p>
              <p>Best regards,<br/>The VistaVoyage Team</p>
            </div>
          `
        });
      } catch (emailError) {
        console.error('❌ Error sending client email:', emailError.message);
      }
    }

    // Send Company Notification Email
    try {
      await sendEmail({
        to: process.env.COMPANY_EMAIL || 'info@vistavoyagetravel.group',
        from: process.env.EMAIL_USER,
        replyTo: guestEmail,
        subject: `New ${type} Request: ${tourTitle} - ${guestName}`,
        html: `
          <div style="font-family: sans-serif;">
            <h2>New Request Received</h2>
            <p><strong>Type:</strong> ${type}</p>
            <p><strong>Client Name:</strong> ${guestName}</p>
            <p><strong>Client Email:</strong> ${guestEmail}</p>
            <p><strong>Client Phone:</strong> ${guestPhone}</p>
            <hr/>
            <p><strong>Reference:</strong> ${tourTitle}</p>
            ${fromDate ? `<p><strong>Dates:</strong> ${new Date(fromDate).toDateString()} ${toDate ? `to ${new Date(toDate).toDateString()}` : ''}</p>` : ''}
            <p><strong>Guests:</strong> ${guestsCount}</p>
            <p><strong>Total Price:</strong> $${booking.totalPrice}</p>
            ${booking.metadata?.appliedSeasons ? `<p><strong>Applied Seasonal Rates:</strong> ${booking.metadata.appliedSeasons.join(', ')}</p>` : ''}
            <p><strong>Request ID:</strong> ${booking._id}</p>
            ${metadata ? `<p><strong>Metadata:</strong> ${JSON.stringify(metadata, null, 2)}</p>` : ''}
          </div>
        `
      });
    } catch (companyEmailError) {
      console.error('❌ Error sending company notification email:', companyEmailError.message);
    }

    /* 
    // Send SMS
    if (guestPhone) {
      const smsMessage = `Hi ${guestName}, your booking for ${tourTitle} is confirmed! ID: ${booking._id}. Thank you for choosing VistaVoyage.`;
      try { 
        await sendSMS(guestPhone, smsMessage); 
      } catch (smsError) {
        console.error('❌ Error sending SMS:', smsError.message);
      }
    }
    */

    res.status(201).json(booking);
  } catch (error) {
    console.error('❌ FATAL Error in createBooking:', error);
    res.status(500).json({ error: error.message });
  }
};

const getBookings = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.type) {
      filter.type = req.query.type;
    }
    if (req.query.workflowStatus) {
      filter.workflowStatus = req.query.workflowStatus;
    } else if (req.query.workflowStatuses) {
      const list = req.query.workflowStatuses
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length) {
        filter.workflowStatus = { $in: list };
      }
    }

    // Counts for tab badges: only apply broad filters (e.g. type), not workflow list filters
    const countFilter = {};
    if (req.query.type) {
      countFilter.type = req.query.type;
    }

    const [bookings, total, scopeTotal, statusAgg] = await Promise.all([
      Booking.find(filter)
        .populate('tour')
        .populate('confirmedBy', 'name role')
        .populate('quotedBy', 'name role')
        .populate('respondedBy', 'name role')
        .populate('assignedWorkers', 'name role email status')
        .populate('internalNotes.author', 'name role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Booking.countDocuments(filter),
      Booking.countDocuments(countFilter),
      Booking.aggregate([
        { $match: countFilter },
        { $group: { _id: '$workflowStatus', n: { $sum: 1 } } },
      ]),
    ]);

    const workflowCounts = Object.fromEntries(
      statusAgg.map((x) => [x._id || 'UNKNOWN', x.n])
    );

    res.json({
      data: bookings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        scopeTotal,
      },
      workflowCounts,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const assignWorkers = async (req, res) => {
  const { id } = req.params;
  const { workerIds } = req.body;

  try {
    console.log(`🔨 Assigning workers to booking: ${id}`, workerIds);

    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    booking.assignedWorkers = workerIds;
    
    // Auto-transition to ASSIGNED if currently NEW
    if (booking.workflowStatus === 'NEW' && workerIds.length > 0) {
      booking.workflowStatus = 'ASSIGNED';
    }

    booking.activityTimeline.push({
      action: 'Workers Assigned',
      details: `Assigned ${workerIds.length} executive(s) to this booking`,
    });

    await booking.save();

    await Activity.create({
      action: 'Workers Assigned',
      metadata: { bookingId: id, workerCount: workerIds.length, guestName: booking.guestName }
    });
    
    const updatedBooking = await Booking.findById(id)
      .populate('assignedWorkers', 'name role email status')
      .populate('tour');

    // Emit real-time update
    const io = req.app.get('io');
    if (io) io.emit('bookingUpdated', updatedBooking);

    console.log('✅ Workers assigned successfully');
    res.json(updatedBooking);
  } catch (error) {
    console.error('❌ Error in assignWorkers:', error.message);
    res.status(500).json({ error: error.message });
  }
};

const updateWorkflowStatus = async (req, res) => {
  const { id } = req.params;
  const { workflowStatus, details } = req.body;

  try {
    console.log(`🔨 Updating workflow for booking: ${id} to ${workflowStatus}`);

    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const oldStatus = booking.workflowStatus;
    booking.workflowStatus = workflowStatus;

    // Side effects based on status
    if (workflowStatus === 'QUOTE_SENT') {
      booking.quoteStatus = 'SENT';
    } else if (workflowStatus === 'CONFIRMED') {
      booking.status = 'CONFIRMED';
      booking.quoteStatus = 'CONFIRMED';
    } else if (workflowStatus === 'COMPLETED') {
      booking.status = 'CONFIRMED';
    } else if (workflowStatus === 'CANCELLED') {
      booking.status = 'CANCELLED';
    }

    booking.activityTimeline.push({
      action: `Status: ${workflowStatus}`,
      details: details || `Status changed from ${oldStatus} to ${workflowStatus}`,
    });

    await booking.save();

    await Activity.create({
      action: 'Status Updated',
      metadata: { bookingId: id, oldStatus, newStatus: workflowStatus, guestName: booking.guestName }
    });

    const updatedBooking = await Booking.findById(id)
      .populate('assignedWorkers', 'name role email status')
      .populate('tour');

    // Emit real-time update
    const io = req.app.get('io');
    if (io) io.emit('bookingUpdated', updatedBooking);

    console.log('✅ Workflow updated successfully');
    res.json(updatedBooking);
  } catch (error) {
    console.error('❌ Error in updateWorkflowStatus:', error.message);
    res.status(500).json({ error: error.message });
  }
};

const addInternalNote = async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;

  try {
    const booking = await Booking.findById(id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    booking.internalNotes.push({
      text,
    });

    await booking.save();
    
    const updatedBooking = await Booking.findById(id)
      .populate('internalNotes.author', 'name role')
      .populate('assignedWorkers', 'name role email status');

    res.json(updatedBooking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { 
  createBooking, 
  getBookings, 
  sendBookingQuote, 
  getQuotePrice,
  assignWorkers,
  updateWorkflowStatus,
  addInternalNote
};
