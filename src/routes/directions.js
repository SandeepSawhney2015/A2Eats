const express = require('express');
const axios = require('axios');
const requireAuth = require('../middleware/auth');
const { checkRateLimit } = require('../db/rateLimit');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const { limited } = await checkRateLimit(`directions:${req.userId}`, 30, 60 * 60 * 1000);
  if (limited) {
    return res.status(429).json({ error: 'Too many directions requests. Try again later.' });
  }

  const { originLat, originLng, destLat, destLng } = req.query;

  if (!originLat || !originLng || !destLat || !destLng) {
    return res.status(400).json({ error: 'originLat, originLng, destLat, destLng are required' });
  }

  try {
    const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
      params: {
        origin: `${originLat},${originLng}`,
        destination: `${destLat},${destLng}`,
        mode: 'transit',
        transit_mode: 'bus',
        key: process.env.GOOGLE_PLACES_API_KEY,
      },
    });

    const data = response.data;

    if (!data.routes || data.routes.length === 0) {
      return res.status(404).json({ error: 'No transit route found' });
    }

    const leg = data.routes[0].legs[0];

    const steps = leg.steps.map(step => {
      const base = {
        mode: step.travel_mode,
        duration: step.duration.text,
        distance: step.distance.text,
        instruction: step.html_instructions?.replace(/<[^>]*>/g, '') || '',
      };

      if (step.travel_mode === 'TRANSIT' && step.transit_details) {
        const t = step.transit_details;
        base.transit = {
          lineName: t.line.short_name || t.line.name,
          lineFullName: t.line.name,
          departureStop: t.departure_stop.name,
          arrivalStop: t.arrival_stop.name,
          departureTime: t.departure_time?.text || null,
          numStops: t.num_stops,
        };
      }

      return base;
    });

    res.json({
      duration: leg.duration.text,
      distance: leg.distance.text,
      steps,
    });
  } catch (err) {
    console.error('Directions error:', err.message);
    res.status(500).json({ error: 'Failed to get directions' });
  }
});

module.exports = router;
