const express = require('express');
const multer  = require('multer');
const path    = require('path');
const { getAllProperties, createProperty, updateProperty, deleteProperty } = require('../controllers/propertyController');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/')),
  filename:    (req, file, cb) => cb(null, Date.now() + '_' + Math.random().toString(36).slice(2) + path.extname(file.originalname)),
});
const upload = multer({ storage }).single('heroImage');

router.get('/',     getAllProperties);
router.post('/',    upload, createProperty);
router.put('/:id',  upload, updateProperty);
router.patch('/:id',upload, updateProperty);
router.delete('/:id', deleteProperty);

module.exports = router;
