const Blog = require('../models/Blog');

const getAllBlogs = async (req, res) => {
  console.log('📬 GET /api/blogs called');
  try {
    const blogs = await Blog.find({ status: 'APPROVED' }).sort({ createdAt: -1 });
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const submitBlog = async (req, res) => {
  try {
    const { title, content, author, authorEmail, image, tags } = req.body;
    const blog = new Blog({
      title,
      content,
      author,
      authorEmail,
      image,
      tags
    });
    await blog.save();
    res.status(201).json({ message: 'Blog submitted for review', blog });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAdminBlogs = async (req, res) => {
  try {
    const blogs = await Blog.find().sort({ createdAt: -1 });
    res.json(blogs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateBlogStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    const blog = await Blog.findByIdAndUpdate(id, { status }, { new: true });
    if (!blog) return res.status(404).json({ message: 'Blog not found' });
    res.json({ message: `Blog ${status.toLowerCase()} successfully`, blog });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllBlogs,
  submitBlog,
  getAdminBlogs,
  updateBlogStatus
};
