const path = require('path');
const fs = require('fs');
const multer = require('multer');
const GalleryImage = require('../models/GalleryImage');

// ─── Multer storage ───────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads', 'gallery');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Only image files are allowed'), false);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });
exports.upload = upload;

// ─── GET /api/gallery?status=approved|pending|all ─────────────────────────────
exports.getGallery = async (req, res) => {
  try {
    const { status = 'approved', category } = req.query;
    const filter = status === 'all' ? {} : { status };
    if (category) filter.category = category;
    const images = await GalleryImage.find(filter).sort({ createdAt: -1 });
    res.json(images);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── POST /api/gallery ────────────────────────────────────────────────────────
// Body fields: caption, category, submitterName, submitterEmail
// Header/body field: source = 'admin' | 'public' (defaults to 'public')
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const {
      caption = '',
      category = 'General',
      submitterName = '',
      submitterEmail = '',
      source = 'public',
    } = req.body;

    const isAdmin = source === 'admin';

    const image = await GalleryImage.create({
      url:            `/uploads/gallery/${req.file.filename}`,
      filename:       req.file.filename,
      caption,
      category,
      uploadedBy:     isAdmin ? 'admin' : (submitterName || 'anonymous'),
      submitterEmail: isAdmin ? '' : submitterEmail,
      source:         isAdmin ? 'admin' : 'public',
      status:         isAdmin ? 'approved' : 'pending',
    });

    res.status(201).json(image);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── PATCH /api/gallery/:id ───────────────────────────────────────────────────
exports.updateImageStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected', 'pending'].includes(status))
      return res.status(400).json({ message: 'Invalid status' });

    const image = await GalleryImage.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!image) return res.status(404).json({ message: 'Image not found' });
    res.json(image);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── DELETE /api/gallery/:id ──────────────────────────────────────────────────
exports.deleteImage = async (req, res) => {
  try {
    const image = await GalleryImage.findByIdAndDelete(req.params.id);
    if (!image) return res.status(404).json({ message: 'Image not found' });

    const filePath = path.join(uploadDir, image.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ message: 'Image deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
