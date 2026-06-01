const express = require('express');
const multer = require('multer');
const path = require('path');
const { getSeasons, createSeason, updateSeason, deleteSeason } = require('../controllers/seasonController');

const router = express.Router();

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
router.post('/', upload.array('images'), createSeason);
router.patch('/:id', upload.single('image'), updateSeason);
router.delete('/:id', deleteSeason);

module.exports = router;
