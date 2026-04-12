const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Get top 50 users ranked by chud points
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, chud_points,
        RANK() OVER (ORDER BY chud_points DESC) AS rank
       FROM users
       ORDER BY chud_points DESC
       LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get the logged in user's rank
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, chud_points,
        RANK() OVER (ORDER BY chud_points DESC) AS rank
       FROM users`,
    );
    const user = result.rows.find(row => row.id === req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
