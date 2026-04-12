const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    // User data + rank
    const userResult = await pool.query(
      `SELECT id, name, email, chud_points, profile_photo,
        (SELECT COUNT(*) + 1 FROM users WHERE chud_points > u.chud_points) AS rank
       FROM users u
       WHERE id = $1`,
      [req.userId]
    );
    if (!userResult.rows[0]) return res.status(404).json({ error: 'User not found' });

    // 5 most recent check-ins that have photos
    const checkinsResult = await pool.query(
      `SELECT ci.id, ci.photo_url, ci.points_earned, ci.created_at,
              s.name AS spot_name, s.category
       FROM check_ins ci
       JOIN spots s ON ci.spot_id = s.id
       WHERE ci.user_id = $1
       ORDER BY ci.created_at DESC
       LIMIT 5`,
      [req.userId]
    );

    // Cuisine breakdown across all check-ins
    const cuisineResult = await pool.query(
      `SELECT s.category, COUNT(*) AS count
       FROM check_ins ci
       JOIN spots s ON ci.spot_id = s.id
       WHERE ci.user_id = $1 AND s.category IS NOT NULL AND s.category != ''
       GROUP BY s.category
       ORDER BY count DESC`,
      [req.userId]
    );

    res.json({
      user: userResult.rows[0],
      recentCheckins: checkinsResult.rows,
      cuisineBreakdown: cuisineResult.rows.map(r => ({ name: r.category, value: parseInt(r.count) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/photo', requireAuth, async (req, res) => {
  const { photo_url } = req.body;
  if (!photo_url) return res.status(400).json({ error: 'photo_url required' });
  try {
    await pool.query('UPDATE users SET profile_photo = $1 WHERE id = $2', [photo_url, req.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
