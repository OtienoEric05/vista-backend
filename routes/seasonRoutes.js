const express = require('express');
const multer = require('multer');
const path = require('path');
const { getSeasons, createSeason, updateSeason, deleteSeason } = require('../controllers/seasonController');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

// Multer Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/'));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage });

router.get('/', getSeasons);
router.post('/', protect, admin, upload.array('images'), createSeason);
router.patch('/:id', protect, admin, upload.single('image'), updateSeason);
router.delete('/:id', protect, admin, deleteSeason);

module.exports = router;
