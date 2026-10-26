/**
 * Lightweight lookup routes for Experiences, Transport, and Destinations.
 * These are simple in-memory/static lists since there are no dedicated models.
 * Replace with DB-backed models if needed in the future.
 */
const express = require('express');
const router  = express.Router();

// GET /api/experiences
router.get('/experiences', (req, res) => {
  res.json({ data: [], total: 0 });
});

// GET /api/transport
router.get('/transport', (req, res) => {
  res.json({ data: [], total: 0 });
});

// GET /api/destinations
router.get('/destinations', (req, res) => {
  res.json({ data: [], total: 0 });
});

module.exports = router;
