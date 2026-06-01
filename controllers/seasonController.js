const Season = require('../models/Season');

const getSeasons = async (req, res) => {
  try {
    const seasons = await Season.find().sort({ startDate: 1 });
    res.json(seasons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const createSeason = async (req, res) => {
  try {
    console.log('📅 POST /api/seasons - Processing Request');
    
    let seasonsData;
    if (req.body.data) {
      try {
        seasonsData = JSON.parse(req.body.data);
      } catch (err) {
        console.error('❌ JSON parse error:', err.message);
        return res.status(400).json({ message: 'Invalid data format' });
      }
    } else {
      seasonsData = req.body;
    }

    if (!seasonsData) {
      return res.status(400).json({ message: 'No season data provided' });
    }

    // Convert to array if it's a single object
    const dataArray = Array.isArray(seasonsData) ? seasonsData : [seasonsData];
    
    // Process images
    let fileIdx = 0;
    let processedData = dataArray.map((s, idx) => {
      const updated = { ...s };
      // Map images if bulk creation with imageRef
      if (s.imageRef !== undefined && req.files && req.files[fileIdx]) {
        updated.image = `/uploads/${req.files[fileIdx].filename}`;
        fileIdx++;
      } else if (req.file && idx === 0) {
        // Single upload via upload.single('image')
        updated.image = `/uploads/${req.file.filename}`;
      }
      delete updated.imageRef; // Remove helper field
      return updated;
    });

    // Clean and validate data before Mongoose
    const finalData = processedData.filter(s => {
      const hasName = s.name && String(s.name).trim() !== '';
      const hasStart = s.startDate && String(s.startDate).trim() !== '';
      const hasEnd = s.endDate && String(s.endDate).trim() !== '';
      
      // Basic log for debugging
      if (!hasName || !hasStart || !hasEnd) {
        console.log(`⚠️ Skipping record due to missing fields: ${s.name || 'Unnamed'}`);
      }
      
      return hasName && hasStart && hasEnd;
    });

    if (finalData.length === 0) {
      return res.status(400).json({ message: 'No valid season records found. Name, Start Date, and End Date are required.' });
    }

    console.log(`📦 Finalizing ${finalData.length} seasons...`);
    const seasons = await Season.insertMany(finalData);
    console.log('✅ Success: Seasons stored in MongoDB');
    res.status(201).json(seasons);
    
  } catch (error) {
    console.error('❌ Mongoose/Server Error:', error.message);
    res.status(500).json({ 
      message: error.message,
      error: error.name === 'ValidationError' ? 'Validation Failed' : 'Server Error'
    });
  }
};

const updateSeason = async (req, res) => {
  try {
    console.log(`📅 PATCH /api/seasons/${req.params.id}`);
    const updateData = { ...req.body };
    if (req.file) {
      updateData.image = `/uploads/${req.file.filename}`;
    }
    
    // Convert dates if they are empty strings to null or remove them?
    // Mongoose will fail if required fields are explicitly set to empty strings.
    if (updateData.startDate === '') delete updateData.startDate;
    if (updateData.endDate === '') delete updateData.endDate;
    if (updateData.name === '') delete updateData.name;

    const season = await Season.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!season) return res.status(404).json({ message: 'Season not found' });
    
    res.json(season);
  } catch (error) {
    console.error('❌ Error in updateSeason:', error.message);
    res.status(500).json({ message: error.message });
  }
};

const deleteSeason = async (req, res) => {
  try {
    await Season.findByIdAndDelete(req.params.id);
    res.json({ message: 'Season deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { getSeasons, createSeason, updateSeason, deleteSeason };
