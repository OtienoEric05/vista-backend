const express = require('express');
const router  = express.Router();
const blogController              = require('../controllers/blogController');
const { authenticate, authorize } = require('../lib/auth');
const { publicFormLimiter }       = require('../lib/rateLimiter');

// Public
router.get('/',       blogController.getAllBlogs);
router.post('/submit', publicFormLimiter, blogController.submitBlog);

// Admin only
router.get('/admin/all',    authenticate, authorize('ADMIN', 'MANAGER'), blogController.getAdminBlogs);
router.patch('/:id/status', authenticate, authorize('ADMIN', 'MANAGER'), blogController.updateBlogStatus);

module.exports = router;
