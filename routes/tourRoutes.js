const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const {
  getAllTours, getFeaturedTours, getTourById,
  createTour, updateTour, deleteTour, bulkDelete, importTours
} = require('../controllers/tourController');

const router = express.Router();

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/')),
  filename:    (req, file, cb) => cb(null, Date.now() + '_' + Math.random().toString(36).slice(2) + path.extname(file.originalname))
});
const uploadImages = multer({ storage: imageStorage }).fields([
  { name: 'image',   maxCount: 1  },
  { name: 'gallery', maxCount: 20 }
]);

const importStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/')),
  filename:    (req, file, cb) => cb(null, 'import_' + Date.now() + path.extname(file.originalname))
});
const uploadImport = multer({ storage: importStorage }).single('file');

router.get('/',          getAllTours);
router.get('/featured',  getFeaturedTours);
router.post('/import',   uploadImport, importTours);
router.delete('/bulk',   bulkDelete);
router.get('/:id',       getTourById);

router.post('/',         uploadImages, createTour);
router.put('/:id',       uploadImages, updateTour);
router.patch('/:id',     uploadImages, updateTour);
router.delete('/:id',    deleteTour);

module.exports = router;
