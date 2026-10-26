const Property = require('../models/Property');

const getAllProperties = async (req, res) => {
  try {
    const limit = Math.min(500, parseInt(req.query.limit, 10) || 200);
    const properties = await Property.find().sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ data: properties });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const createProperty = async (req, res) => {
  try {
    const heroImage = req.file ? `/uploads/${req.file.filename}` : req.body.heroImage || '';
    let amenities = req.body.amenities;
    if (typeof amenities === 'string') {
      try { amenities = JSON.parse(amenities); } catch { amenities = amenities.split(',').map(s => s.trim()).filter(Boolean); }
    }
    const property = await Property.create({ ...req.body, amenities: amenities || [], heroImage });
    res.status(201).json({ data: property });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const updateProperty = async (req, res) => {
  try {
    const update = { ...req.body };
    if (req.file) update.heroImage = `/uploads/${req.file.filename}`;
    if (update.amenities && typeof update.amenities === 'string') {
      try { update.amenities = JSON.parse(update.amenities); } catch { update.amenities = update.amenities.split(',').map(s => s.trim()).filter(Boolean); }
    }
    const property = await Property.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!property) return res.status(404).json({ message: 'Property not found' });
    res.json({ data: property });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

const deleteProperty = async (req, res) => {
  try {
    const property = await Property.findByIdAndDelete(req.params.id);
    if (!property) return res.status(404).json({ message: 'Property not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

module.exports = { getAllProperties, createProperty, updateProperty, deleteProperty };
