const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const {
  getAllTours, getFeaturedTours, getTourById,
  createTour, updateTour, deleteTour, bulkDelete, importTours
} = require('../controllers/tourController');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

/* ── storage for tour images ── */
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/')),
  filename:    (req, file, cb) => cb(null, Date.now() + '_' + Math.random().toString(36).slice(2) + path.extname(file.originalname))
});
const uploadImages = multer({ storage: imageStorage }).fields([
  { name: 'image',   maxCount: 1  },
  { name: 'gallery', maxCount: 20 }
]);

/* ── storage for import files ── */
const importStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/')),
  filename:    (req, file, cb) => cb(null, 'import_' + Date.now() + path.extname(file.originalname))
});
const uploadImport = multer({ storage: importStorage }).single('file');

/* ── routes ── */
router.get('/',          getAllTours);
router.get('/featured',  getFeaturedTours);
router.post('/import',   protect, admin, uploadImport, importTours);
router.delete('/bulk',   protect, admin, bulkDelete);
router.get('/:id',       getTourById);

router.post('/',         protect, admin, uploadImages, createTour);
router.put('/:id',       protect, admin, uploadImages, updateTour);
router.patch('/:id',     protect, admin, uploadImages, updateTour);
router.delete('/:id',    protect, admin, deleteTour);

module.exports = router;
