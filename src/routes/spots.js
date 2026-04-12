const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory rate limiters
const suggestionLog = new Map();
const editSuggestionLog = new Map();

// Auto-create edit suggestions table
pool.query(`
  CREATE TABLE IF NOT EXISTS spot_edit_suggestions (
    id SERIAL PRIMARY KEY,
    spot_id INTEGER REFERENCES spots(id) ON DELETE CASCADE,
    user_id INTEGER,
    field TEXT NOT NULL,
    suggested_value TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(console.error);

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
  const { name, address, category, lat, lng, honeypot, manual } = req.body;

  // Bot detection — honeypot field should always be empty
  if (honeypot) {
    return res.status(400).json({ error: 'Invalid submission' });
  }

  if (!name || !address || !category) {
    return res.status(400).json({ error: 'name, address, and category are required' });
  }

  // Rate limiting — max 2 suggestions per user per day
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const userLog = (suggestionLog.get(req.userId) || []).filter(t => now - t < oneDay);
  if (userLog.length >= 2) {
    return res.status(429).json({ error: 'You can only suggest 2 spots per day. Try again tomorrow.' });
  }

  // Duplicate check — case insensitive name match
  const existing = await pool.query(
    'SELECT id FROM spots WHERE LOWER(name) = LOWER($1)',
    [name]
  );
  if (existing.rows.length > 0) {
    return res.status(400).json({ error: 'This spot is already in the database.' });
  }

  if (!lat || !lng) {
    return res.status(400).json({ error: 'Location coordinates are required.' });
  }

  // For manual entries, verify with Claude that this is a real restaurant
  if (manual) {
    try {
      // Sanitize: strip HTML tags and limit length before sending to Claude
      const safeName = name.replace(/<[^>]*>/g, '').replace(/[^\w\s''\-&.]/g, '').trim().slice(0, 100);

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 64,
        messages: [{
          role: 'user',
          content: `Is "${safeName}" a real restaurant, cafe, bar, or food establishment? Reply with only valid JSON: {"isRestaurant": true} or {"isRestaurant": false}`
        }]
      });
      const raw = message.content[0].text.trim();
      const json = JSON.parse(raw.match(/\{.*\}/s)[0]);
      if (!json.isRestaurant) {
        return res.status(400).json({ error: `"${name}" doesn't appear to be a real restaurant or food establishment.` });
      }
    } catch (err) {
      console.error('Claude verification error:', err);
      // If Claude fails, let it through rather than blocking valid suggestions
    }
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

// Suggest an edit for a spot
router.post('/:id/suggest-edit', requireAuth, async (req, res) => {
  const { field, suggested_value, notes } = req.body;
  if (!field || !suggested_value?.trim()) {
    return res.status(400).json({ error: 'field and suggested_value are required' });
  }

  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const userLog = (editSuggestionLog.get(req.userId) || []).filter(t => now - t < oneHour);
  if (userLog.length >= 5) {
    return res.status(429).json({ error: 'Edit suggestion limit reached (5/hour). Try again later.' });
  }

  const spot = await pool.query('SELECT id FROM spots WHERE id = $1', [req.params.id]);
  if (!spot.rows.length) return res.status(404).json({ error: 'Spot not found' });

  try {
    await pool.query(
      'INSERT INTO spot_edit_suggestions (spot_id, user_id, field, suggested_value, notes) VALUES ($1, $2, $3, $4, $5)',
      [req.params.id, req.userId, field, suggested_value.trim(), notes?.trim() || null]
    );
    userLog.push(now);
    editSuggestionLog.set(req.userId, userLog);
    res.json({ message: 'Edit suggestion submitted. Thanks!' });
  } catch (err) {
    console.error(err);
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
