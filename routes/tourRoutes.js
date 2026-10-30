const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const {
  getAllTours, getFeaturedTours, getTourById,
  createTour, updateTour, deleteTour, bulkDelete, importTours,
  seedDefaultTours
} = require('../controllers/tourController');

const router = express.Router();

const uploadDir = path.join(__dirname, '../uploads/');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, Date.now() + '_' + Math.random().toString(36).slice(2) + path.extname(file.originalname))
});

const uploadImages = multer({
  storage: imageStorage,
  limits: { fileSize: 25 * 1024 * 1024 }
}).fields([
  { name: 'image',   maxCount: 10 },
  { name: 'images',  maxCount: 20 },
  { name: 'gallery', maxCount: 20 },
  { name: 'file',    maxCount: 10 },
  { name: 'files',   maxCount: 20 }
]);

const uploadAny = multer({
  storage: imageStorage,
  limits: { fileSize: 25 * 1024 * 1024 }
}).any();

const importStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => cb(null, 'import_' + Date.now() + path.extname(file.originalname))
});
const uploadImport = multer({ storage: importStorage }).single('file');

router.get('/',               getAllTours);
router.get('/featured',       getFeaturedTours);
router.post('/import',        uploadImport, importTours);
router.post('/seed-defaults', seedDefaultTours);
router.delete('/bulk',        bulkDelete);

// Standalone image upload handler — supports single and multiple images, any field name
const handleImageUpload = (req, res) => {
  let files = [];
  if (Array.isArray(req.files)) {
    files = req.files;
  } else if (req.files && typeof req.files === 'object') {
    Object.values(req.files).forEach((item) => {
      if (Array.isArray(item)) files.push(...item);
      else if (item) files.push(item);
    });
  } else if (req.file) {
    files = [req.file];
  }

  if (!files || files.length === 0) {
    return res.status(400).json({ message: 'No image uploaded' });
  }

  const urls = files.map((f) => `/uploads/${f.filename}`);
  const firstUrl = urls[0];

  return res.json({
    success: true,
    message: 'Images uploaded successfully',
    url: firstUrl,
    urls: urls,
    images: urls,
    files: urls,
    data: urls,
  });
};

router.post('/upload-images', uploadAny, handleImageUpload);
router.post('/upload-image',  uploadAny, handleImageUpload);
router.post('/upload',        uploadAny, handleImageUpload);

router.get('/:id',       getTourById);

router.post('/',         uploadImages, createTour);
router.put('/:id',       uploadImages, updateTour);
router.patch('/:id',     uploadImages, updateTour);
router.delete('/:id',    deleteTour);

module.exports = router;
