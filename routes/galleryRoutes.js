const express = require('express');
const router  = express.Router();
const { upload, getGallery, uploadImage, updateImageStatus, deleteImage } = require('../controllers/galleryController');
const { authenticate, authorize } = require('../lib/auth');
const { uploadLimiter }           = require('../lib/rateLimiter');

// Public — get approved images
router.get('/', getGallery);

// Public upload (pending review) — rate limited
router.post('/', uploadLimiter, upload.single('image'), uploadImage);

// Admin only
router.patch('/:id',  authenticate, authorize('ADMIN', 'MANAGER'), updateImageStatus);
router.delete('/:id', authenticate, authorize('ADMIN', 'MANAGER'), deleteImage);

module.exports = router;
