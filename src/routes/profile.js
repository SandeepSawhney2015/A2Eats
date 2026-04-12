const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');
const Filter = require('bad-words');

const router = express.Router();
const filter = new Filter();

// Substring roots — catches concatenated words that tokenizers miss (e.g. "fuckshit")
const PROFANE_ROOTS = [
  'fuck','shit','cunt','cock','dick','pussy','ass','bitch','nigger','nigga',
  'faggot','fag','chink','spic','kike','tranny','retard','wetback','gook',
  'cracker','dyke','whore','slut','cuck','twat','piss','prick','bastard',
];
function containsProfaneSubstring(str) {
  const lower = str.toLowerCase();
  return PROFANE_ROOTS.some(w => lower.includes(w));
}

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

router.patch('/name', requireAuth, async (req, res) => {
  const raw = req.body.name;
  if (typeof raw !== 'string') return res.status(400).json({ error: 'name required' });

  const name = raw.trim();

  if (name.length < 3 || name.length > 20) {
    return res.status(400).json({ error: 'Username must be 3–20 characters' });
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return res.status(400).json({ error: 'Only letters, numbers, _ and - allowed' });
  }
  if (filter.isProfane(name) || containsProfaneSubstring(name)) {
    return res.status(400).json({ error: 'Username contains inappropriate content' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE name = $1 AND id != $2', [name, req.userId]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'That username is already taken' });

    await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name, req.userId]);
    res.json({ success: true, name });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

function isValidPhotoUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && url.length <= 2048;
  } catch {
    return false;
  }
}

router.patch('/photo', requireAuth, async (req, res) => {
  const { photo_url } = req.body;
  if (!photo_url) return res.status(400).json({ error: 'photo_url required' });
  if (!isValidPhotoUrl(photo_url)) return res.status(400).json({ error: 'Invalid photo URL.' });
  try {
    await pool.query('UPDATE users SET profile_photo = $1 WHERE id = $2', [photo_url, req.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
