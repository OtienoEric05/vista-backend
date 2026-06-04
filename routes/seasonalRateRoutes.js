const express = require('express');
const multer  = require('multer');
const path    = require('path');
const {
  searchRates, getRates, createRate, updateRate, deleteRate, importRates
} = require('../controllers/seasonalRateController');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/')),
  filename:    (req, file, cb) => cb(null, 'sr_import_' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage }).single('file');

// Public — destination + date search (used by frontend search bar)
router.get('/search', searchRates);

// Admin CRUD
router.get('/',          getRates);
router.post('/',         createRate);
router.patch('/:id',     updateRate);
router.delete('/:id',    deleteRate);

// Admin Excel/CSV bulk upload
router.post('/import',   upload, importRates);

module.exports = router;
