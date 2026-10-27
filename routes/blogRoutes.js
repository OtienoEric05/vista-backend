const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');

// Public routes
router.get('/', blogController.getAllBlogs);
router.post('/submit', blogController.submitBlog);

// Admin routes
router.get('/admin/all', blogController.getAdminBlogs);
router.patch('/:id/status', blogController.updateBlogStatus);

module.exports = router;
