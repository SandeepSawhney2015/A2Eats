const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const CHECKIN_RADIUS_MILES = 0.05; // ~265 feet
const BASE_POINTS = 10;
const DOUBLE_CHUD_POINTS = 3;
const HOP_BONUS_POINTS = 20;

function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

async function getActiveHop(userId) {
  const result = await pool.query(
    `SELECT * FROM hops WHERE user_id = $1 AND status IN ('building', 'active') ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const hop = result.rows[0];
  if (!hop) return null;

  // Auto-fail if expired
  if (hop.status === 'active' && hop.expires_at && new Date() > new Date(hop.expires_at)) {
    await pool.query(`UPDATE hops SET status = 'failed' WHERE id = $1`, [hop.id]);
    return { ...hop, status: 'failed' };
  }

  return hop;
}

async function getStops(hopId) {
  const result = await pool.query(
    `SELECT hs.id, hs.position, hs.checked_in_at, hs.checkin_id,
            s.id AS spot_id, s.name, s.address, s.lat, s.lng, s.category
     FROM hop_spots hs
     JOIN spots s ON hs.spot_id = s.id
     WHERE hs.hop_id = $1
     ORDER BY hs.position ASC`,
    [hopId]
  );
  return result.rows;
}

// GET /current
router.get('/current', requireAuth, async (req, res) => {
  try {
    const hop = await getActiveHop(req.userId);
    if (!hop) return res.json(null);
    const stops = await getStops(hop.id);
    res.json({ ...hop, stops });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST / — create new building hop (clears any old building hop)
router.post('/', requireAuth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE hops SET status = 'failed' WHERE user_id = $1 AND status = 'building'`,
      [req.userId]
    );
    const result = await pool.query(
      `INSERT INTO hops (user_id, name, status) VALUES ($1, 'My Hop', 'building') RETURNING *`,
      [req.userId]
    );
    res.json({ ...result.rows[0], stops: [] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /current/stops — add a stop
router.post('/current/stops', requireAuth, async (req, res) => {
  const { spot_id } = req.body;
  try {
    const hop = await getActiveHop(req.userId);
    if (!hop || hop.status !== 'building') return res.status(400).json({ error: 'No building hop' });

    const existing = await pool.query(
      `SELECT id FROM hop_spots WHERE hop_id = $1 AND spot_id = $2`,
      [hop.id, spot_id]
    );
    if (existing.rows[0]) return res.status(400).json({ error: 'Spot already in hop' });

    const posResult = await pool.query(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next FROM hop_spots WHERE hop_id = $1`,
      [hop.id]
    );
    await pool.query(
      `INSERT INTO hop_spots (hop_id, spot_id, position) VALUES ($1, $2, $3)`,
      [hop.id, spot_id, posResult.rows[0].next]
    );

    const stops = await getStops(hop.id);
    res.json({ ...hop, stops });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /current/stops/:stopId — remove a stop
router.delete('/current/stops/:stopId', requireAuth, async (req, res) => {
  try {
    const hop = await getActiveHop(req.userId);
    if (!hop || hop.status !== 'building') return res.status(400).json({ error: 'No building hop' });

    await pool.query(`DELETE FROM hop_spots WHERE id = $1 AND hop_id = $2`, [req.params.stopId, hop.id]);

    const remaining = await pool.query(
      `SELECT id FROM hop_spots WHERE hop_id = $1 ORDER BY position ASC`, [hop.id]
    );
    for (let i = 0; i < remaining.rows.length; i++) {
      await pool.query(`UPDATE hop_spots SET position = $1 WHERE id = $2`, [i + 1, remaining.rows[i].id]);
    }

    const stops = await getStops(hop.id);
    res.json({ ...hop, stops });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /current/start — lock in and start the hop
router.post('/current/start', requireAuth, async (req, res) => {
  try {
    const hop = await getActiveHop(req.userId);
    if (!hop || hop.status !== 'building') return res.status(400).json({ error: 'No building hop' });

    const stops = await getStops(hop.id);
    if (stops.length < 2) return res.status(400).json({ error: 'Add at least 2 stops to start a hop' });

    const result = await pool.query(
      `UPDATE hops SET status = 'active', started_at = NOW(), expires_at = NOW() + interval '24 hours'
       WHERE id = $1 RETURNING *`,
      [hop.id]
    );
    res.json({ ...result.rows[0], stops });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /current/stops/:stopId/complete — GPS verify + record chud
router.post('/current/stops/:stopId/complete', requireAuth, async (req, res) => {
  const { user_lat, user_lng } = req.body;
  if (!user_lat || !user_lng) return res.status(400).json({ error: 'Location required' });

  try {
    const hop = await getActiveHop(req.userId);
    if (!hop || hop.status !== 'active') return res.status(400).json({ error: 'No active hop' });

    const stopResult = await pool.query(
      `SELECT hs.*, s.lat, s.lng, s.name AS spot_name
       FROM hop_spots hs JOIN spots s ON hs.spot_id = s.id
       WHERE hs.id = $1 AND hs.hop_id = $2`,
      [req.params.stopId, hop.id]
    );
    const stop = stopResult.rows[0];
    if (!stop) return res.status(404).json({ error: 'Stop not found' });
    if (stop.checked_in_at) return res.status(400).json({ error: 'Already completed this stop' });

    // GPS proximity check
    const dist = haversine(parseFloat(user_lat), parseFloat(user_lng), parseFloat(stop.lat), parseFloat(stop.lng));
    if (dist > CHECKIN_RADIUS_MILES) {
      const ft = Math.round(dist * 5280);
      return res.status(400).json({ error: `You're ${ft} ft away — get within ${Math.round(CHECKIN_RADIUS_MILES * 5280)} ft to chow.` });
    }

    // Per-spot daily cooldown — can't chud the same place twice in one day
    const todayAtSpot = await pool.query(
      `SELECT id FROM check_ins WHERE user_id = $1 AND spot_id = $2 AND created_at > NOW() - INTERVAL '24 hours'`,
      [req.userId, stop.spot_id]
    );
    if (todayAtSpot.rows.length > 0) {
      return res.status(429).json({ error: `You already chowed here today. Come back tomorrow!` });
    }

    // First visit or Double Chud? (visited before, just not today)
    const prev = await pool.query(
      `SELECT id FROM check_ins WHERE user_id = $1 AND spot_id = $2`, [req.userId, stop.spot_id]
    );
    const isDoubleChud = prev.rows.length > 0;
    const points = isDoubleChud ? DOUBLE_CHUD_POINTS : BASE_POINTS;

    // Record check-in
    const checkinResult = await pool.query(
      `INSERT INTO check_ins (user_id, spot_id, points_earned) VALUES ($1, $2, $3) RETURNING id`,
      [req.userId, stop.spot_id, points]
    );
    await pool.query(`UPDATE users SET chud_points = chud_points + $1 WHERE id = $2`, [points, req.userId]);

    // Mark stop done
    await pool.query(
      `UPDATE hop_spots SET checked_in_at = NOW(), checkin_id = $1 WHERE id = $2`,
      [checkinResult.rows[0].id, stop.id]
    );

    // Check if hop is complete
    const remaining = await pool.query(
      `SELECT id FROM hop_spots WHERE hop_id = $1 AND checked_in_at IS NULL`, [hop.id]
    );
    let hopCompleted = false;
    if (remaining.rows.length === 0) {
      await pool.query(
        `UPDATE hops SET status = 'completed', completed_at = NOW(), bonus_awarded = TRUE WHERE id = $1`,
        [hop.id]
      );
      await pool.query(`UPDATE users SET chud_points = chud_points + $1 WHERE id = $2`, [HOP_BONUS_POINTS, req.userId]);
      hopCompleted = true;
    }

    const stops = await getStops(hop.id);
    res.json({ points, isDoubleChud, hopCompleted, bonusPoints: hopCompleted ? HOP_BONUS_POINTS : 0, stops });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /current/fail — abandon current hop
router.post('/current/fail', requireAuth, async (req, res) => {
  try {
    const hop = await getActiveHop(req.userId);
    if (!hop) return res.status(400).json({ error: 'No active hop' });
    await pool.query(`UPDATE hops SET status = 'failed' WHERE id = $1`, [hop.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
