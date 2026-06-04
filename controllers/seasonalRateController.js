const SeasonalRate = require('../models/SeasonalRate');
const path = require('path');
const fs   = require('fs');

// ── Public: Search by destination + travel date ───────────────────────────────
// GET /api/seasonal-rates/search?destination=Masai+Mara&travelDate=2026-08-15
const searchRates = async (req, res) => {
  const { destination, travelDate, adults = 1, children = 0 } = req.query;

  if (!destination || !travelDate) {
    return res.status(400).json({ error: 'destination and travelDate are required.' });
  }

  try {
    const date = new Date(travelDate);
    if (isNaN(date)) return res.status(400).json({ error: 'Invalid travelDate format.' });

    const rates = await SeasonalRate.find({
      destination: { $regex: destination, $options: 'i' },
      startDate:   { $lte: date },
      endDate:     { $gte: date }
    }).lean();

    if (rates.length === 0) {
      return res.json({ results: [], message: 'No packages available for the selected destination and date.' });
    }

    // Attach computed price based on adults/children
    const results = rates.map(r => ({
      ...r,
      computedPrice: {
        adults:   parseInt(adults)   * r.perPersonSharing,
        children: parseInt(children) * r.childRate
      }
    }));

    res.json({ results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── Admin: CRUD ───────────────────────────────────────────────────────────────
const getRates = async (req, res) => {
  try {
    const { destination, search } = req.query;
    const filter = {};
    if (destination) filter.destination = { $regex: destination, $options: 'i' };
    if (search)      filter.$or = [
      { destination: { $regex: search, $options: 'i' } },
      { packageName: { $regex: search, $options: 'i' } },
      { seasonLabel: { $regex: search, $options: 'i' } }
    ];
    const rates = await SeasonalRate.find(filter).sort({ destination: 1, startDate: 1 }).lean();
    res.json(rates);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const createRate = async (req, res) => {
  try {
    const rate = await SeasonalRate.create(req.body);
    res.status(201).json(rate);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const updateRate = async (req, res) => {
  try {
    const rate = await SeasonalRate.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!rate) return res.status(404).json({ message: 'Rate not found' });
    res.json(rate);
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const deleteRate = async (req, res) => {
  try {
    await SeasonalRate.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

// ── Admin: Excel import ───────────────────────────────────────────────────────
// Expected columns: destination, packageName, seasonLabel, startDate, endDate,
//                   perPersonSharing, singleRoom, childRate, currency, duration, notes
const importRates = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const ext      = path.extname(req.file.originalname).toLowerCase();
  const filePath = req.file.path;

  try {
    let rows = [];

    if (ext === '.csv') {
      const lines   = fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
        return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']));
      });
    } else {
      let XLSX;
      try { XLSX = require('xlsx'); }
      catch { return res.status(500).json({ message: 'xlsx package not installed' }); }
      const wb = XLSX.readFile(filePath);
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    }

    const REQUIRED = ['destination', 'packageName', 'seasonLabel', 'startDate', 'endDate', 'perPersonSharing'];
    const missing  = REQUIRED.filter(k => !(k in (rows[0] || {})));
    if (missing.length) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ message: `Missing columns: ${missing.join(', ')}` });
    }

    const results = { created: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      if (!row.destination || !row.startDate || !row.endDate || !row.perPersonSharing) {
        results.skipped++;
        continue;
      }
      try {
        await SeasonalRate.create({
          destination:      row.destination.trim(),
          packageName:      row.packageName?.trim()  || row.destination.trim(),
          seasonLabel:      row.seasonLabel?.trim()  || 'Standard',
          startDate:        new Date(row.startDate),
          endDate:          new Date(row.endDate),
          perPersonSharing: Number(row.perPersonSharing) || 0,
          singleRoom:       Number(row.singleRoom)       || 0,
          childRate:        Number(row.childRate)        || 0,
          currency:         row.currency?.trim()         || 'USD',
          duration:         row.duration?.trim()         || '',
          inclusions:       row.inclusions ? row.inclusions.split('|').map(s => s.trim()) : [],
          notes:            row.notes?.trim()            || ''
        });
        results.created++;
      } catch (e) {
        results.errors.push(`Row "${row.destination}": ${e.message}`);
      }
    }

    fs.unlinkSync(filePath);
    res.json(results);
  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: err.message });
  }
};

module.exports = { searchRates, getRates, createRate, updateRate, deleteRate, importRates };
