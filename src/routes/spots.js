const express = require('express');
const axios = require('axios');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

// In-memory rate limiter: userId -> array of submission timestamps
const suggestionLog = new Map();

const router = express.Router();

// Get all spots (All A2 mode)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM spots ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get nearby spots (Near Me mode) — requires lat and lng as query params
router.get('/nearby', async (req, res) => {
  const { lat, lng, radius = 0.5 } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM (
        SELECT *, (
          3959 * acos(
            LEAST(1, cos(radians($1)) * cos(radians(lat)) *
            cos(radians(lng) - radians($2)) +
            sin(radians($1)) * sin(radians(lat)))
          )
        ) AS distance
        FROM spots
      ) d
      WHERE distance <= $3
      ORDER BY distance ASC`,
      [lat, lng, radius]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Add a new spot (admin only for now)
router.post('/', requireAuth, async (req, res) => {
  const { name, address, lat, lng, category, photo_url, rating, yelp_id } = req.body;

  if (!name || !address || !lat || !lng) {
    return res.status(400).json({ error: 'name, address, lat, and lng are required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO spots (name, address, lat, lng, category, photo_url, rating, yelp_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [name, address, lat, lng, category, photo_url, rating, yelp_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Spot already exists' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Suggest a new spot
router.post('/suggest', requireAuth, async (req, res) => {
  const { name, address, category, lat, lng, honeypot } = req.body;

  // Bot detection — honeypot field should always be empty
  if (honeypot) {
    return res.status(400).json({ error: 'Invalid submission' });
  }

  if (!name || !address || !category || !lat || !lng) {
    return res.status(400).json({ error: 'Please select a restaurant from the search dropdown.' });
  }

  // Rate limiting — max 2 suggestions per user per hour
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const userLog = (suggestionLog.get(req.userId) || []).filter(t => now - t < oneHour);
  if (userLog.length >= 2) {
    return res.status(429).json({ error: 'You can only suggest 2 spots per hour. Try again later.' });
  }

  // Duplicate check — case insensitive name match
  const existing = await pool.query(
    'SELECT id FROM spots WHERE LOWER(name) = LOWER($1)',
    [name]
  );
  if (existing.rows.length > 0) {
    return res.status(400).json({ error: 'This spot is already in the database.' });
  }

  try {
    await pool.query(
      'INSERT INTO spots (name, address, lat, lng, category) VALUES ($1, $2, $3, $4, $5)',
      [name, address, lat, lng, category]
    );

    userLog.push(now);
    suggestionLog.set(req.userId, userLog);

    res.json({ message: 'Spot suggestion received' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/search', async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);
  try {
    const words = q.trim().split(/\s+/).filter(w => w.length > 0);
    const conditions = words.map((_, i) => `(name ILIKE $${i + 1} OR address ILIKE $${i + 1})`).join(' AND ');
    const params = words.map(w => `%${w}%`);
    const result = await pool.query(
      `SELECT id, name, address, lat, lng, category FROM spots WHERE ${conditions} ORDER BY name ASC LIMIT 15`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get a single spot by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM spots WHERE id = $1', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Spot not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
