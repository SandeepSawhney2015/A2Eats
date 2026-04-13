const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const BASE_POINTS = 10;
const DOUBLE_CHUD_POINTS = 3;

const CHECKIN_RADIUS_MILES = 0.05; // ~265 feet — tight enough to require being at the spot, forgiving for GPS drift
const GLOBAL_CHECKIN_COOLDOWN_MS = 30 * 60 * 1000; // 30 min between any check-ins

function isValidPhotoUrl(url) {
  if (!url) return true; // optional field
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && url.length <= 2048;
  } catch {
    return false;
  }
}

function haversine(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const R = 3959; // miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Check in to a spot
router.post('/', requireAuth, async (req, res) => {
  const { spot_id, user_lat, user_lng, photo_url, hop_id } = req.body;

  if (!spot_id || user_lat == null || user_lng == null) {
    return res.status(400).json({ error: 'spot_id, user_lat, and user_lng are required' });
  }

  if (!isValidPhotoUrl(photo_url)) {
    return res.status(400).json({ error: 'Invalid photo URL.' });
  }

  try {
    // Check spot exists
    const spotResult = await pool.query('SELECT * FROM spots WHERE id = $1', [spot_id]);
    if (!spotResult.rows[0]) return res.status(404).json({ error: 'Spot not found' });

    // Verify user is physically at the spot
    const spot = spotResult.rows[0];
    const distance = haversine(parseFloat(user_lat), parseFloat(user_lng), spot.lat, spot.lng);
    if (distance > CHECKIN_RADIUS_MILES) {
      return res.status(403).json({
        error: `You're ${(distance * 5280).toFixed(0)} ft away — you need to be at the restaurant to check in.`
      });
    }

    // Global 30min cooldown — applies to all check-ins, hop or not
    const lastAny = await pool.query(
      'SELECT created_at FROM check_ins WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.userId]
    );
    if (lastAny.rows.length > 0) {
      const msSinceLast = Date.now() - new Date(lastAny.rows[0].created_at).getTime();
      if (msSinceLast < GLOBAL_CHECKIN_COOLDOWN_MS) {
        const minsLeft = Math.ceil((GLOBAL_CHECKIN_COOLDOWN_MS - msSinceLast) / 60000);
        return res.status(429).json({
          error: `You just checked in somewhere. Wait ${minsLeft} minute${minsLeft !== 1 ? 's' : ''} before checking in again.`
        });
      }
    }

    // Check previous check-ins at this spot
    const existing = await pool.query(
      'SELECT id, created_at FROM check_ins WHERE user_id = $1 AND spot_id = $2 ORDER BY created_at DESC LIMIT 1',
      [req.userId, spot_id]
    );
    const isDoubleChud = existing.rows.length > 0;

    if (existing.rows.length > 0) {
      const lastCheckin = new Date(existing.rows[0].created_at);
      const hoursSince = (Date.now() - lastCheckin.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        const hoursLeft = Math.ceil(24 - hoursSince);
        return res.status(429).json({
          error: `You already checked in here recently. Come back in ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}.`
        });
      }
    }

    if (!isDoubleChud && !photo_url) {
      return res.status(400).json({ error: 'A photo is required for your first check-in.' });
    }

    let pointsEarned = isDoubleChud ? DOUBLE_CHUD_POINTS : BASE_POINTS;
    let multiplier = 1.0;

    // If part of a hop, calculate multiplier
    if (hop_id) {
      const hopResult = await pool.query(
        'SELECT * FROM hops WHERE id = $1 AND user_id = $2 AND status = $3',
        [hop_id, req.userId, 'active']
      );
      const hop = hopResult.rows[0];

      if (hop) {
        // Verify this is the next spot in the hop sequence
        const nextSpot = await pool.query(
          `SELECT hs.* FROM hop_spots hs
           WHERE hs.hop_id = $1 AND hs.checked_in_at IS NULL
           ORDER BY hs.position ASC LIMIT 1`,
          [hop_id]
        );

        if (nextSpot.rows[0] && nextSpot.rows[0].spot_id === parseInt(spot_id)) {
          // Mark hop spot as checked in
          await pool.query(
            'UPDATE hop_spots SET checked_in_at = NOW() WHERE hop_id = $1 AND spot_id = $2',
            [hop_id, spot_id]
          );

          // Count how many hop spots completed so far
          const completedResult = await pool.query(
            'SELECT COUNT(*) FROM hop_spots WHERE hop_id = $1 AND checked_in_at IS NOT NULL',
            [hop_id]
          );
          const completed = parseInt(completedResult.rows[0].count);
          multiplier = 1 + (completed - 1) * 0.5;

          // Update hop multiplier
          await pool.query('UPDATE hops SET multiplier = $1 WHERE id = $2', [multiplier, hop_id]);

          // Check if all hop spots are done
          const remainingResult = await pool.query(
            'SELECT COUNT(*) FROM hop_spots WHERE hop_id = $1 AND checked_in_at IS NULL',
            [hop_id]
          );
          if (parseInt(remainingResult.rows[0].count) === 0) {
            await pool.query('UPDATE hops SET status = $1 WHERE id = $2', ['completed', hop_id]);
          }
        }
      }
    }

    pointsEarned = Math.round(BASE_POINTS * multiplier);

    // Create check-in
    const checkIn = await pool.query(
      'INSERT INTO check_ins (user_id, spot_id, photo_url, points_earned) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.userId, spot_id, photo_url, pointsEarned]
    );

    // Update user's total chud points
    await pool.query(
      'UPDATE users SET chud_points = chud_points + $1 WHERE id = $2',
      [pointsEarned, req.userId]
    );

    res.json({ checkIn: checkIn.rows[0], pointsEarned, multiplier, isDoubleChud });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check visit status for a spot (is it a first visit? is cooldown active?)
router.get('/status/:spotId', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT created_at FROM check_ins WHERE user_id = $1 AND spot_id = $2 ORDER BY created_at DESC LIMIT 1',
      [req.userId, req.params.spotId]
    );
    if (result.rows.length === 0) {
      return res.json({ isFirstVisit: true, canCheckin: true });
    }
    const hoursSince = (Date.now() - new Date(result.rows[0].created_at).getTime()) / (1000 * 60 * 60);
    const hoursLeft = Math.ceil(24 - hoursSince);
    res.json({ isFirstVisit: false, canCheckin: hoursSince >= 24, hoursLeft: Math.max(0, hoursLeft) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all check-ins for the logged in user
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ci.*, s.name AS spot_name, s.address, s.lat, s.lng
       FROM check_ins ci
       JOIN spots s ON ci.spot_id = s.id
       WHERE ci.user_id = $1
       ORDER BY ci.created_at DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
