const Tour = require('../models/Tour');
const path = require('path');
const fs   = require('fs');

/* ─── helpers ─────────────────────────────────────────── */
const parseJSON = (val) => {
  if (!val) return [];
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return []; }
};

/* ─── GET all ──────────────────────────────────────────── */
const getAllTours = async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip  = (page - 1) * limit;

    const filter = {};
    if (req.query.category)  filter.category  = req.query.category;
    if (req.query.available) filter.available  = req.query.available === 'true';
    if (req.query.tag)       filter.tags       = req.query.tag;
    if (req.query.search) {
      filter.$or = [
        { title:    { $regex: req.query.search, $options: 'i' } },
        { location: { $regex: req.query.search, $options: 'i' } },
      ];
    }

    const [tours, total] = await Promise.all([
      Tour.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Tour.countDocuments(filter),
    ]);

    res.json({ data: tours, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ─── GET featured ─────────────────────────────────────── */
const getFeaturedTours = async (req, res) => {
  try {
    const tours = await Tour.find({ $or: [{ tag: 'Best Seller' }, { tags: 'Popular' }] }).lean();
    res.json(tours);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ─── GET by id ────────────────────────────────────────── */
const getTourById = async (req, res) => {
  try {
    const tour = await Tour.findById(req.params.id).lean();
    if (!tour) return res.status(404).json({ message: 'Tour not found' });
    res.json(tour);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ─── POST create ──────────────────────────────────────── */
const createTour = async (req, res) => {
  try {
    const { title, description, price, duration, location, category, tag, available } = req.body;

    // featured image
    const image = req.files?.image?.[0]
      ? `/uploads/${req.files.image[0].filename}`
      : req.body.image || '';

    // gallery images
    const gallery = (req.files?.gallery || []).map(f => `/uploads/${f.filename}`);

    const tour = await Tour.create({
      title, description,
      price:    Number(price),
      duration, location,
      category: category || 'General',
      tag,
      tags:           parseJSON(req.body.tags),
      available:      available !== undefined ? available === 'true' || available === true : true,
      image, gallery,
      seasonalPrices: parseJSON(req.body.seasonalPrices),
      itinerary:      parseJSON(req.body.itinerary),
      inclusions:     parseJSON(req.body.inclusions),
      exclusions:     parseJSON(req.body.exclusions),
    });

    const io = req.app.get('io');
    if (io) io.emit('statsUpdate');

    res.status(201).json(tour);
  } catch (err) {
    console.error('❌ createTour:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/* ─── PUT / PATCH update ───────────────────────────────── */
const updateTour = async (req, res) => {
  try {
    const update = { ...req.body };

    if (req.files?.image?.[0])   update.image   = `/uploads/${req.files.image[0].filename}`;
    if (req.files?.gallery?.length) {
      update.gallery = (req.files.gallery || []).map(f => `/uploads/${f.filename}`);
    }

    ['seasonalPrices','itinerary','inclusions','exclusions','tags'].forEach(k => {
      if (update[k] && typeof update[k] === 'string') update[k] = parseJSON(update[k]);
    });
    if (update.price)     update.price     = Number(update.price);
    if (update.available !== undefined) update.available = update.available === 'true' || update.available === true;

    const tour = await Tour.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!tour) return res.status(404).json({ message: 'Tour not found' });
    res.json(tour);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ─── DELETE single ────────────────────────────────────── */
const deleteTour = async (req, res) => {
  try {
    const tour = await Tour.findByIdAndDelete(req.params.id);
    if (!tour) return res.status(404).json({ message: 'Tour not found' });
    const io = req.app.get('io');
    if (io) io.emit('statsUpdate');
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ─── DELETE bulk ──────────────────────────────────────── */
const bulkDelete = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ message: 'No ids provided' });
    const result = await Tour.deleteMany({ _id: { $in: ids } });
    const io = req.app.get('io');
    if (io) io.emit('statsUpdate');
    res.json({ deleted: result.deletedCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

/* ─── POST import (Excel / CSV) ────────────────────────── */
const importTours = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const ext  = path.extname(req.file.originalname).toLowerCase();
  const filePath = req.file.path;

  try {
    let rows = [];

    if (ext === '.csv') {
      const text = fs.readFileSync(filePath, 'utf8');
      const lines = text.split('\n').filter(Boolean);
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']));
      });
    } else {
      // xlsx / xls — require xlsx lazily so server still starts if not installed
      let XLSX;
      try { XLSX = require('xlsx'); }
      catch { return res.status(500).json({ message: 'xlsx package not installed. Run: npm install xlsx' }); }

      const wb = XLSX.readFile(filePath);
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    }

    // Required columns
    const REQUIRED = ['title', 'description', 'price', 'duration', 'location'];
    const firstRow = rows[0] || {};
    const missing  = REQUIRED.filter(k => !(k in firstRow));
    if (missing.length) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ message: `Missing required columns: ${missing.join(', ')}` });
    }

    const results = { created: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      if (!row.title || !row.price) { results.skipped++; continue; }

      // Duplicate check
      const exists = await Tour.findOne({ title: row.title.trim() });
      if (exists) { results.skipped++; continue; }

      try {
        const inclusions = row.inclusions ? row.inclusions.split('|').map(s => s.trim()) : [];
        const exclusions = row.exclusions ? row.exclusions.split('|').map(s => s.trim()) : [];
        const tags       = row.tags       ? row.tags.split('|').map(s => s.trim())       : [];

        await Tour.create({
          title:       row.title.trim(),
          description: row.description?.trim() || '',
          price:       Number(row.price) || 0,
          duration:    row.duration?.trim() || '',
          location:    row.location?.trim() || '',
          category:    row.category?.trim() || 'General',
          tag:         row.tag?.trim() || '',
          tags, inclusions, exclusions,
          available:   row.available !== 'false',
          image:       row.image?.trim() || '',
        });
        results.created++;
      } catch (e) {
        results.errors.push(`Row "${row.title}": ${e.message}`);
      }
    }

    fs.unlinkSync(filePath);
    const io = req.app.get('io');
    if (io) io.emit('statsUpdate');
    res.json(results);
  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getAllTours, getFeaturedTours, getTourById, createTour, updateTour, deleteTour, bulkDelete, importTours };
