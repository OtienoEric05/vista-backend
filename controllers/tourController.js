const mongoose     = require('mongoose');
const Tour         = require('../models/Tour');
const defaultTours = require('../data/defaultTours');
const path         = require('path');
const fs           = require('fs');

/* ─── helpers ─────────────────────────────────────────── */
const parseJSON = (val, fallback = []) => {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
};

const normalizeMeals = (meals) => {
  if (!meals) return '';
  if (Array.isArray(meals)) return meals.join(', ');
  return String(meals);
};

const normalizeItinerary = (raw) => {
  const items = parseJSON(raw, []);
  if (!Array.isArray(items)) return [];
  return items.map((item, idx) => ({
    day:           item.day || (idx + 1),
    timings:       item.timings || '',
    title:         item.title || '',
    description:   item.description || [item.morning, item.afternoon, item.evening].filter(Boolean).join(' '),
    meals:         normalizeMeals(item.meals),
    accommodation: item.accommodation || '',
    activities:    Array.isArray(item.activities) ? item.activities : [],
    notes:         item.notes || '',
  }));
};

const slugify = (text) => {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/* ─── GET all tours ────────────────────────────────────── */
const getAllTours = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip  = (page - 1) * limit;

    const filter = {};

    // Filter by publishing status: 'published' | 'draft' | 'archived'
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }

    // Filter by travel world: 'experience' | 'journey' | 'worldwide'
    if (req.query.travelType && req.query.travelType !== 'all') {
      filter.travelType = req.query.travelType;
    }

    // Filter by category
    if (req.query.category && req.query.category !== 'all') {
      filter.category = req.query.category;
    }

    // Filter by featured
    if (req.query.featured === 'true') {
      filter.featured = true;
    }

    // Filter by availability
    if (req.query.available !== undefined) {
      filter.available = req.query.available === 'true';
    }

    // Filter by tag
    if (req.query.tag && req.query.tag !== 'all') {
      filter.$or = [{ tag: req.query.tag }, { tags: req.query.tag }];
    }

    // Search query
    if (req.query.search) {
      const q = req.query.search.trim();
      filter.$or = [
        { title:       { $regex: q, $options: 'i' } },
        { subtitle:    { $regex: q, $options: 'i' } },
        { location:    { $regex: q, $options: 'i' } },
        { destination: { $regex: q, $options: 'i' } },
        { country:     { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } },
      ];
    }

    let [tours, total] = await Promise.all([
      Tour.find(filter)
        .sort({ featured: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Tour.countDocuments(filter),
    ]);

    // Self-healing / bootstrapping: If database has 0 tours and no filter, seed default frontend tours
    if (total === 0 && Object.keys(filter).length === 0) {
      console.log('⚠️ Tours collection is empty. Auto-seeding 9 frontend default tours...');
      try {
        await Tour.insertMany(defaultTours);
        tours = await Tour.find().sort({ featured: -1, createdAt: -1 }).skip(skip).limit(limit).lean();
        total = tours.length;
      } catch (e) {
        console.error('Auto-seed fallback error:', e.message);
      }
    }

    // Ensure `id` alias is available for frontend ease of access
    const transformed = tours.map(t => ({
      ...t,
      id: t._id.toString(),
      destination: t.destination || t.location || '',
      location:    t.location || t.destination || '',
      availability: t.availability !== false && t.available !== false,
    }));

    res.json({
      data: transformed,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    console.error('❌ getAllTours error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/* ─── GET featured tours ───────────────────────────────── */
const getFeaturedTours = async (req, res) => {
  try {
    let tours = await Tour.find({
      status: { $ne: 'archived' },
      $or: [
        { featured: true },
        { tag: 'Best Seller' },
        { tag: 'Signature Safari' },
        { tag: 'Signature 12-Hour Day' },
        { tags: 'Popular' }
      ]
    })
      .sort({ featured: -1, createdAt: -1 })
      .lean();

    if (tours.length === 0) {
      tours = defaultTours.filter(t => t.featured);
    }

    const transformed = tours.map(t => ({
      ...t,
      id: t._id ? t._id.toString() : t.slug,
      destination: t.destination || t.location || '',
      location:    t.location || t.destination || '',
    }));

    res.json(transformed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ─── GET tour by id or slug ───────────────────────────── */
const getTourById = async (req, res) => {
  try {
    const param = req.params.id;
    let tour = null;

    if (mongoose.Types.ObjectId.isValid(param)) {
      tour = await Tour.findById(param).lean();
    }

    if (!tour) {
      tour = await Tour.findOne({ slug: param }).lean();
    }

    if (!tour && !mongoose.Types.ObjectId.isValid(param)) {
      // Try loose title match
      tour = await Tour.findOne({ title: { $regex: new RegExp(`^${param.replace(/-/g, ' ')}$`, 'i') } }).lean();
    }

    // Fallback to default collection if not found in db
    if (!tour) {
      const fallback = defaultTours.find(t => 
        t.slug === param || 
        t.title.toLowerCase() === param.toLowerCase().replace(/-/g, ' ')
      );
      if (fallback) {
        try {
          const created = await Tour.create(fallback);
          tour = created.toObject();
        } catch {
          tour = { ...fallback, _id: fallback.slug, id: fallback.slug };
        }
      }
    }

    if (!tour) {
      return res.status(404).json({ message: 'Tour not found' });
    }

    const transformed = {
      ...tour,
      id: tour._id ? tour._id.toString() : tour.slug,
      destination: tour.destination || tour.location || '',
      location:    tour.location || tour.destination || '',
      availability: tour.availability !== false && tour.available !== false,
    };

    res.json(transformed);
  } catch (err) {
    console.error('❌ getTourById error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/* ─── POST /api/tours/seed-defaults (Sync with frontend tours) ─ */
const seedDefaultTours = async (req, res) => {
  try {
    let created = 0;
    let updated = 0;

    for (const item of defaultTours) {
      const existing = await Tour.findOne({
        $or: [
          { slug: item.slug },
          { title: item.title }
        ]
      });

      if (existing) {
        await Tour.findByIdAndUpdate(existing._id, item, { new: true });
        updated++;
      } else {
        await Tour.create(item);
        created++;
      }
    }

    const io = req.app.get('io');
    if (io) io.emit('statsUpdate');

    const total = await Tour.countDocuments();
    res.json({
      message: 'Tours successfully synchronized with frontend collection',
      created,
      updated,
      total,
    });
  } catch (err) {
    console.error('❌ seedDefaultTours error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/* ─── POST create tour ─────────────────────────────────── */
const createTour = async (req, res) => {
  try {
    const body = { ...req.body };

    // Image handling
    if (req.files?.image?.[0]) {
      body.image = `/uploads/${req.files.image[0].filename}`;
    }
    if (req.files?.gallery?.length) {
      body.gallery = req.files.gallery.map(f => `/uploads/${f.filename}`);
    }

    // Resolve location & destination
    const resolvedLoc = body.destination || body.location || '';
    const resolvedDest = body.location || body.destination || '';

    // Auto-generate slug if absent
    const slug = body.slug?.trim() || slugify(body.title);

    // Auto-compute nights if absent and duration contains hours/days
    let nights = body.nights !== undefined && body.nights !== '' ? Number(body.nights) : 0;
    if (body.duration && !nights) {
      const match = body.duration.match(/(\d+)\s*night/i);
      if (match) nights = parseInt(match[1], 10);
      else if (/hour/i.test(body.duration)) nights = 0;
    }

    // Determine travelType
    let travelType = body.travelType;
    if (!travelType) {
      if (/hour/i.test(body.duration || '') || nights === 0) travelType = 'experience';
      else if (['south africa', 'uae', 'dubai', 'rwanda', 'australia'].some(c => (body.country || resolvedLoc).toLowerCase().includes(c))) {
        travelType = 'worldwide';
      } else {
        travelType = 'journey';
      }
    }

    const tourData = {
      title:           body.title?.trim(),
      subtitle:        body.subtitle?.trim() || '',
      slug,
      travelType,
      description:     body.description?.trim(),
      fullDescription: body.fullDescription?.trim() || body.description?.trim() || '',
      price:           Number(body.price) || 0,
      currency:        body.currency || 'USD',
      priceType:       body.priceType || 'per_person',
      displayPrice:    body.displayPrice || '',
      duration:        body.duration?.trim(),
      nights,
      location:        resolvedLoc,
      destination:     resolvedDest,
      country:         body.country?.trim() || 'Kenya',
      region:          body.region?.trim() || '',
      destinationRef:  mongoose.Types.ObjectId.isValid(body.destinationRef) ? body.destinationRef : undefined,
      category:        body.category || 'Luxury Safari',
      travelStyle:     body.travelStyle || 'Private',
      difficulty:      body.difficulty || 'Easy',
      bestSeason:      body.bestSeason || 'Year-Round',
      minTravelers:    Number(body.minTravelers) || 1,
      maxTravelers:    Number(body.maxTravelers) || 20,
      tag:             body.tag?.trim() || '',
      tags:            parseJSON(body.tags, []),
      status:          body.status || 'published',
      featured:        body.featured === 'true' || body.featured === true,
      available:       body.available !== undefined ? (body.available === 'true' || body.available === true) : true,
      availability:    body.availability !== undefined ? (body.availability === 'true' || body.availability === true) : true,
      showOnWebsite:   body.showOnWebsite !== 'false' && body.showOnWebsite !== false,
      image:           body.image || '',
      gallery:         Array.isArray(body.gallery) ? body.gallery : parseJSON(body.gallery, []),
      videoUrl:        body.videoUrl || '',
      seoTitle:        body.seoTitle || '',
      seoDescription:  body.seoDescription || '',
      seoKeywords:     body.seoKeywords || '',
      seoSlug:         body.seoSlug || slug,
      highlights:      parseJSON(body.highlights, []),
      itinerary:       normalizeItinerary(body.itinerary),
      inclusions:      parseJSON(body.inclusions, []),
      exclusions:      parseJSON(body.exclusions, []),
      accommodationOptions: parseJSON(body.accommodationOptions || body.accommodations, []),
      accommodations:       parseJSON(body.accommodations || body.accommodationOptions, []),
      experienceOptions:    parseJSON(body.experienceOptions, []),
      transportOptions:     parseJSON(body.transportOptions, []),
      seasonalPrices:       parseJSON(body.seasonalPrices, []),
      travelInfo:           body.travelInfo || '',
      bestTimeToVisit:      body.bestTimeToVisit || '',
      whatToPack:           body.whatToPack || '',
      travelRequirements:   body.travelRequirements || '',
      healthSafety:         body.healthSafety || '',
      cancellationPolicy:   body.cancellationPolicy || '',
      importantNotes:       body.importantNotes || '',
      bookingType:          body.bookingType || 'enquiry',
      requiresApproval:     body.requiresApproval !== 'false' && body.requiresApproval !== false,
      onlinePayment:        body.onlinePayment === 'true' || body.onlinePayment === true,
      notes:                body.notes || '',
      faq:                  parseJSON(body.faq, []),
      pricingRules:         parseJSON(body.pricingRules, []),
    };

    const tour = await Tour.create(tourData);

    const io = req.app.get('io');
    if (io) io.emit('statsUpdate');

    res.status(201).json(tour);
  } catch (err) {
    console.error('❌ createTour:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/* ─── PUT / PATCH update tour ──────────────────────────── */
const updateTour = async (req, res) => {
  try {
    const id = req.params.id;
    let existing = null;

    if (mongoose.Types.ObjectId.isValid(id)) {
      existing = await Tour.findById(id);
    }
    if (!existing) {
      existing = await Tour.findOne({ slug: id });
    }
    if (!existing) {
      return res.status(404).json({ message: 'Tour not found' });
    }

    const update = { ...req.body };

    // Files
    if (req.files?.image?.[0]) {
      update.image = `/uploads/${req.files.image[0].filename}`;
    }
    if (req.files?.gallery?.length) {
      update.gallery = req.files.gallery.map(f => `/uploads/${f.filename}`);
    }

    // JSON fields
    const JSON_FIELDS = [
      'seasonalPrices','inclusions','exclusions','tags','highlights',
      'accommodations','accommodationOptions','experienceOptions','transportOptions',
      'faq','pricingRules'
    ];
    JSON_FIELDS.forEach(k => {
      if (update[k] !== undefined && typeof update[k] === 'string') {
        update[k] = parseJSON(update[k], []);
      }
    });

    if (update.itinerary !== undefined) {
      update.itinerary = normalizeItinerary(update.itinerary);
    }

    // Location / destination mapping
    if (update.destination) update.location = update.destination;
    else if (update.location) update.destination = update.location;

    // Accommodation sync
    if (update.accommodationOptions && !update.accommodations) {
      update.accommodations = update.accommodationOptions;
    }

    // Booleans and numbers
    if (update.price !== undefined) update.price = Number(update.price) || 0;
    if (update.nights !== undefined) update.nights = Number(update.nights) || 0;
    if (update.featured !== undefined) update.featured = update.featured === 'true' || update.featured === true;
    if (update.available !== undefined) {
      const bool = update.available === 'true' || update.available === true;
      update.available = bool;
      update.availability = bool;
    }
    if (update.availability !== undefined) {
      const bool = update.availability === 'true' || update.availability === true;
      update.available = bool;
      update.availability = bool;
    }

    const updated = await Tour.findByIdAndUpdate(existing._id, update, { new: true, runValidators: false });

    const io = req.app.get('io');
    if (io) io.emit('statsUpdate');

    res.json(updated);
  } catch (err) {
    console.error('❌ updateTour:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/* ─── DELETE single tour ───────────────────────────────── */
const deleteTour = async (req, res) => {
  try {
    const id = req.params.id;
    let tour = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      tour = await Tour.findByIdAndDelete(id);
    } else {
      tour = await Tour.findOneAndDelete({ slug: id });
    }

    if (!tour) return res.status(404).json({ message: 'Tour not found' });

    const io = req.app.get('io');
    if (io) io.emit('statsUpdate');

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ─── DELETE bulk ──────────────────────────────────────── */
const bulkDelete = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ message: 'No ids provided' });

    const objectIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
    const slugs = ids.filter(id => !mongoose.Types.ObjectId.isValid(id));

    const result = await Tour.deleteMany({
      $or: [
        { _id: { $in: objectIds } },
        { slug: { $in: slugs } }
      ]
    });

    const io = req.app.get('io');
    if (io) io.emit('statsUpdate');

    res.json({ deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ─── Import helpers ───────────────────────────────────── */
const pipeSplit = (val) =>
  val ? String(val).split('|').map(s => s.trim()).filter(Boolean) : [];

const parseItineraryText = (val) => {
  if (!val) return [];
  return String(val).split('|').map((entry, i) => {
    const parts = entry.split(':').map(s => s.trim());
    const dayMatch = parts[0].match(/day\s*(\d+)/i);
    const day = dayMatch ? parseInt(dayMatch[1]) : i + 1;
    const title = dayMatch ? (parts[1] || '') : (parts[0] || '');
    const description = dayMatch ? (parts.slice(2).join(':').trim()) : (parts.slice(1).join(':').trim());
    return { day, title, description };
  }).filter(e => e.title || e.description);
};

const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
};

/* ─── POST import (Excel / CSV) ────────────────────────── */
const importTours = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const ext      = path.extname(req.file.originalname).toLowerCase();
  const filePath = req.file.path;

  try {
    let rows = [];

    if (ext === '.csv') {
      const text    = fs.readFileSync(filePath, 'utf8');
      const lines   = text.split(/\r?\n/).filter(Boolean);
      const headers = parseCSVLine(lines[0]);
      rows = lines.slice(1)
        .filter(l => l.trim())
        .map(line => {
          const vals = parseCSVLine(line);
          return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']));
        });
    } else {
      let XLSX;
      try { XLSX = require('xlsx'); }
      catch { return res.status(500).json({ message: 'xlsx package not installed.' }); }
      const wb = XLSX.readFile(filePath);
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    }

    const REQUIRED = ['title', 'price', 'duration'];
    const firstRow = rows[0] || {};
    const missing  = REQUIRED.filter(k => !(k in firstRow));
    if (missing.length) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return res.status(400).json({ message: `Missing required columns: ${missing.join(', ')}` });
    }

    const results = { created: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      if (!row.title || !row.price) { results.skipped++; continue; }

      const titleTrim = row.title.trim();
      const slug = row.slug?.trim() || slugify(titleTrim);
      const exists = await Tour.findOne({ $or: [{ slug }, { title: titleTrim }] });
      if (exists) { results.skipped++; continue; }

      try {
        const resolvedLoc = row.destination?.trim() || row.location?.trim() || 'Kenya';
        const nights = Number(row.nights) || (/hour/i.test(row.duration) ? 0 : 1);
        let travelType = row.travelType?.trim();
        if (!travelType) {
          if (/hour/i.test(row.duration)) travelType = 'experience';
          else if (['south africa', 'uae', 'dubai', 'rwanda'].some(c => resolvedLoc.toLowerCase().includes(c))) travelType = 'worldwide';
          else travelType = 'journey';
        }

        await Tour.create({
          title:         titleTrim,
          subtitle:      row.subtitle?.trim() || '',
          slug,
          travelType,
          description:   row.description?.trim() || '',
          price:         Number(row.price) || 0,
          currency:      row.currency?.trim() || 'USD',
          duration:      row.duration?.trim() || '',
          nights,
          location:      resolvedLoc,
          destination:   resolvedLoc,
          country:       row.country?.trim() || 'Kenya',
          category:      row.category?.trim() || 'Luxury Safari',
          tag:           row.tag?.trim() || '',
          tags:          pipeSplit(row.tags),
          inclusions:    pipeSplit(row.inclusions),
          exclusions:    pipeSplit(row.exclusions),
          itinerary:     parseItineraryText(row.itinerary),
          gallery:       pipeSplit(row.gallery),
          status:        row.status?.trim() || 'published',
          available:     row.available !== 'false' && row.available !== false,
          availability:  row.available !== 'false' && row.available !== false,
          showOnWebsite: row.showOnWebsite !== 'false' && row.showOnWebsite !== false,
          image:         row.image?.trim() || '',
        });
        results.created++;
      } catch (e) {
        results.errors.push(`Row "${titleTrim}": ${e.message}`);
      }
    }

    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    const io = req.app.get('io');
    if (io) io.emit('statsUpdate');
    res.json(results);
  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getAllTours,
  getFeaturedTours,
  getTourById,
  seedDefaultTours,
  createTour,
  updateTour,
  deleteTour,
  bulkDelete,
  importTours,
};
