const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const pool = require('./db');
require('dotenv').config();

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SEARCH_CENTERS = [
  // --- Central Campus & Downtown ---
  { lat: 42.2808, lng: -83.7430, label: 'Central Campus' },
  { lat: 42.2780, lng: -83.7410, label: 'State St / William' },
  { lat: 42.2795, lng: -83.7405, label: 'State St / Center' },
  { lat: 42.2765, lng: -83.7400, label: 'State St / South' },
  { lat: 42.2750, lng: -83.7350, label: 'South State St' },
  { lat: 42.2760, lng: -83.7320, label: 'South U' },
  { lat: 42.2810, lng: -83.7350, label: 'East Campus' },
  { lat: 42.2810, lng: -83.7420, label: 'Church St' },
  { lat: 42.2850, lng: -83.7430, label: 'North of Campus' },
  { lat: 42.2730, lng: -83.7430, label: 'South of Campus' },
  { lat: 42.2740, lng: -83.7420, label: 'Packard / State' },

  // --- Main St / Downtown ---
  { lat: 42.2830, lng: -83.7490, label: 'Main St / North' },
  { lat: 42.2820, lng: -83.7490, label: 'Main St / Washington' },
  { lat: 42.2800, lng: -83.7490, label: 'Main St / Middle' },
  { lat: 42.2800, lng: -83.7470, label: 'Washington St' },
  { lat: 42.2790, lng: -83.7490, label: 'Main St / Liberty' },
  { lat: 42.2780, lng: -83.7460, label: 'Liberty / Main' },
  { lat: 42.2770, lng: -83.7490, label: 'Main St / South' },
  { lat: 42.2755, lng: -83.7460, label: 'William / Main' },
  { lat: 42.2750, lng: -83.7480, label: 'Main St / Far South' },
  { lat: 42.2800, lng: -83.7450, label: 'Liberty St' },
  { lat: 42.2840, lng: -83.7470, label: 'North Main' },
  { lat: 42.2860, lng: -83.7390, label: 'Fuller / Maiden Lane' },

  // --- North Campus ---
  { lat: 42.2910, lng: -83.7280, label: 'Huron Pkwy' },
  { lat: 42.2938, lng: -83.7168, label: 'North Campus Core' },
  { lat: 42.2960, lng: -83.7140, label: 'North Campus North' },
  { lat: 42.2920, lng: -83.7120, label: 'North Campus East' },
  { lat: 42.2950, lng: -83.7200, label: 'North Campus Courtyards' },
  { lat: 42.2980, lng: -83.7180, label: 'North Campus Far North' },
  { lat: 42.2900, lng: -83.7220, label: 'North Campus South Edge' },
  { lat: 42.2870, lng: -83.7300, label: 'Plymouth Rd / Campus' },
  { lat: 42.2820, lng: -83.7380, label: 'East side / Hill St' },

  // --- Plymouth Rd Corridor (east) ---
  { lat: 42.2880, lng: -83.7180, label: 'Plymouth / Huron Pkwy' },
  { lat: 42.2890, lng: -83.7080, label: 'Plymouth / Earhart' },
  { lat: 42.2900, lng: -83.6980, label: 'Plymouth / Dixboro' },
  { lat: 42.2910, lng: -83.6900, label: 'Plymouth / east' },

  // --- Washtenaw Ave Corridor ---
  { lat: 42.2760, lng: -83.7260, label: 'Washtenaw / Hill' },
  { lat: 42.2745, lng: -83.7180, label: 'Washtenaw / Pittsfield' },
  { lat: 42.2738, lng: -83.7090, label: 'Washtenaw / Platt' },
  { lat: 42.2730, lng: -83.7000, label: 'Washtenaw / Carpenter' },
  { lat: 42.2725, lng: -83.6920, label: 'Washtenaw / Arborland' },
  { lat: 42.2720, lng: -83.6840, label: 'Washtenaw / east' },

  // --- East Ann Arbor / Carpenter Rd ---
  { lat: 42.2700, lng: -83.7050, label: 'Packard / Carpenter' },
  { lat: 42.2680, lng: -83.7120, label: 'Packard / Platt' },
  { lat: 42.2660, lng: -83.7200, label: 'Packard / east' },
  { lat: 42.2700, lng: -83.6950, label: 'Ellsworth / Carpenter' },
  { lat: 42.2650, lng: -83.7000, label: 'Ellsworth / east' },

  // --- South Ann Arbor ---
  { lat: 42.2650, lng: -83.7320, label: 'Packard / south' },
  { lat: 42.2620, lng: -83.7380, label: 'Packard / Stadium' },
  { lat: 42.2580, lng: -83.7400, label: 'Eisenhower / State' },
  { lat: 42.2550, lng: -83.7420, label: 'Ellsworth / State' },
  { lat: 42.2520, lng: -83.7440, label: 'Ellsworth / far south' },
  { lat: 42.2580, lng: -83.7500, label: 'Eisenhower / Main' },
  { lat: 42.2550, lng: -83.7530, label: 'Ellsworth / Main' },
  { lat: 42.2600, lng: -83.7320, label: 'south Packard' },

  // --- Stadium Blvd / West of Campus ---
  { lat: 42.2720, lng: -83.7500, label: 'Stadium / Main' },
  { lat: 42.2710, lng: -83.7580, label: 'Stadium / Maple' },
  { lat: 42.2700, lng: -83.7660, label: 'W Stadium / Maple' },
  { lat: 42.2690, lng: -83.7740, label: 'W Stadium / west' },

  // --- Maple Rd Corridor ---
  { lat: 42.2760, lng: -83.7580, label: 'Maple / Jackson' },
  { lat: 42.2800, lng: -83.7580, label: 'Maple / Liberty' },
  { lat: 42.2830, lng: -83.7580, label: 'Maple / Huron' },
  { lat: 42.2860, lng: -83.7580, label: 'Maple / Miller' },
  { lat: 42.2900, lng: -83.7580, label: 'Maple / north' },
  { lat: 42.2730, lng: -83.7580, label: 'Maple / south' },
  { lat: 42.2660, lng: -83.7580, label: 'Maple / Scio' },
  { lat: 42.2600, lng: -83.7580, label: 'Maple / far south' },

  // --- Jackson Ave / West Side ---
  { lat: 42.2790, lng: -83.7680, label: 'Jackson / west' },
  { lat: 42.2820, lng: -83.7700, label: 'Huron / Maple west' },
  { lat: 42.2760, lng: -83.7700, label: 'Jackson / far west' },
  { lat: 42.2730, lng: -83.7700, label: 'W Stadium / far west' },

  // --- Miller / Huron / North Main ---
  { lat: 42.2870, lng: -83.7520, label: 'Miller / Main' },
  { lat: 42.2890, lng: -83.7540, label: 'Huron / north Main' },
  { lat: 42.2910, lng: -83.7520, label: 'north Main / north' },
  { lat: 42.2920, lng: -83.7480, label: 'north Main / far north' },
  { lat: 42.2940, lng: -83.7450, label: 'Pontiac Trail' },

  // --- North Ann Arbor ---
  { lat: 42.2970, lng: -83.7400, label: 'Newport / Pontiac' },
  { lat: 42.3000, lng: -83.7350, label: 'Barton Dr area' },
  { lat: 42.3030, lng: -83.7300, label: 'north AA' },
  { lat: 42.3000, lng: -83.7500, label: 'north west AA' },
  { lat: 42.2960, lng: -83.7500, label: 'Pontiac Trail west' },
  { lat: 42.2950, lng: -83.7350, label: 'north central AA' },

  // --- Medical / Hospital area ---
  { lat: 42.2840, lng: -83.7260, label: 'Med Center / Fuller' },
  { lat: 42.2815, lng: -83.7240, label: 'E Medical Center Dr' },
  { lat: 42.2800, lng: -83.7310, label: 'E Ann St / med' },

  // --- Briarwood / South east ---
  { lat: 42.2530, lng: -83.7300, label: 'Briarwood Mall area' },
  { lat: 42.2510, lng: -83.7200, label: 'Briarwood / east' },
  { lat: 42.2540, lng: -83.7150, label: 'Ellsworth / Carpenter east' },
];

async function fetchRestaurants(pageToken = null) {
  const params = {
    location: `42.2808,-83.7430`,
    radius: 3000,
    type: 'restaurant',
    key: GOOGLE_API_KEY,
  };
  if (pageToken) params.pagetoken = pageToken;

  const res = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', { params });
  return res.data;
}

async function fetchFromCenter(lat, lng, pageToken = null) {
  const params = {
    location: `${lat},${lng}`,
    radius: 600,
    type: 'restaurant',
    key: GOOGLE_API_KEY,
  };
  if (pageToken) params.pagetoken = pageToken;

  const res = await axios.get('https://maps.googleapis.com/maps/api/place/nearbysearch/json', { params });
  return res.data;
}

const CUISINE_CATEGORIES = [
  'American', 'Burgers', 'Pizza', 'Italian', 'Mexican', 'Latin American',
  'Chinese', 'Japanese', 'Sushi', 'Korean', 'Thai', 'Vietnamese', 'Indian',
  'Mediterranean', 'Middle Eastern', 'Greek', 'BBQ', 'Seafood',
  'Vegan', 'Café', 'Bakery', 'Brunch', 'Bar & Grill', 'Fast Food', 'Dorm DHalls', 'Other'
];

const DINING_HALLS = [
  { name: 'Bursley Dining Hall', address: '1931 Duffield St, Ann Arbor, MI 48109', lat: 42.2938, lng: -83.7210 },
  { name: 'Couzens Dining Hall', address: '1300 E Ann St, Ann Arbor, MI 48109', lat: 42.2825, lng: -83.7317 },
  { name: 'East Quad Dining Hall', address: '701 E University Ave, Ann Arbor, MI 48109', lat: 42.272944, lng: -83.735163 },
  { name: 'Mosher-Jordan Dining Hall', address: '200 Observatory St, Ann Arbor, MI 48109', lat: 42.28018, lng: -83.73148 },
  { name: 'Markley Dining Hall', address: '1503 Washington Heights, Ann Arbor, MI 48109', lat: 42.2810, lng: -83.7288 },
  { name: 'South Quad Dining Hall', address: '600 E Madison St, Ann Arbor, MI 48109', lat: 42.273841, lng: -83.742264 },
  { name: 'West Quad Dining Hall', address: '541 Thompson St, Ann Arbor, MI 48109', lat: 42.274856, lng: -83.742537 },
  { name: 'Oxford Dining Hall', address: '619 Oxford Rd, Ann Arbor, MI 48109', lat: 42.2758, lng: -83.7262 },
  { name: 'Stockwell Dining Hall', address: '324 Observatory St, Ann Arbor, MI 48109', lat: 42.278838, lng: -83.731586 },
  { name: 'North Quad Dining Hall', address: '105 Hubbard St, Ann Arbor, MI 48109', lat: 42.2812, lng: -83.7398 },
];

async function getCuisineFromClaude(restaurantName, address) {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 10,
      messages: [{
        role: 'user',
        content: `Pick the best cuisine category for the restaurant "${restaurantName}" in Ann Arbor, MI from this exact list:\n${CUISINE_CATEGORIES.join(', ')}\n\nReply with only the category name from the list, nothing else.`
      }]
    });
    const result = message.content[0].text.trim();
    return CUISINE_CATEGORIES.includes(result) ? result : 'Other';
  } catch (err) {
    console.error(`Claude failed for ${restaurantName}:`, err.message);
    return 'Other';
  }
}

async function seedSpots() {
  console.log('Fetching Ann Arbor restaurants from Google Places...');

  let allPlaces = [];

  // Fetch from all search centers
  for (const center of SEARCH_CENTERS) {
    console.log(`Searching around ${center.label}...`);
    try {
      let data = await fetchFromCenter(center.lat, center.lng);
      if (data.results) allPlaces = allPlaces.concat(data.results);

      while (data.next_page_token) {
        await new Promise(r => setTimeout(r, 2000));
        data = await fetchFromCenter(center.lat, center.lng, data.next_page_token);
        if (data.results) allPlaces = allPlaces.concat(data.results);
      }
    } catch (err) {
      console.error(`Failed to fetch ${center.label}:`, err.message);
    }
  }

  // Deduplicate by place_id
  const seen = new Set();
  allPlaces = allPlaces.filter(p => {
    if (seen.has(p.place_id)) return false;
    seen.add(p.place_id);
    return true;
  });

  // Remove any dining halls from Google results — we insert those manually
  const diningHallNames = DINING_HALLS.map(d => d.name.toLowerCase());
  allPlaces = allPlaces.filter(p => !diningHallNames.includes(p.name.toLowerCase()));

  // Load existing spot names so we skip places already in the DB
  const existingRes = await pool.query('SELECT LOWER(name) AS name FROM spots');
  const existingNames = new Set(existingRes.rows.map(r => r.name));

  const newPlaces = allPlaces.filter(p => !existingNames.has(p.name.toLowerCase()));
  console.log(`Found ${allPlaces.length} unique restaurants. ${allPlaces.length - newPlaces.length} already in DB, tagging ${newPlaces.length} new ones with Claude...`);

  let inserted = 0;
  for (const place of newPlaces) {
    const { name, vicinity, geometry, rating } = place;
    const lat = geometry.location.lat;
    const lng = geometry.location.lng;

    process.stdout.write(`Tagging: ${name}... `);
    const category = await getCuisineFromClaude(name, vicinity);
    console.log(category);

    try {
      await pool.query(
        `INSERT INTO spots (name, address, lat, lng, category, rating)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [name, vicinity, lat, lng, category, rating || null]
      );
      inserted++;
    } catch (err) {
      console.error(`Failed to insert ${name}:`, err.message);
    }
  }

  // Insert dining halls directly
  console.log('\nInserting UMich dining halls...');
  for (const hall of DINING_HALLS) {
    try {
      await pool.query(
        `INSERT INTO spots (name, address, lat, lng, category, rating)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [hall.name, hall.address, hall.lat, hall.lng, 'Dorm DHalls', null]
      );
      console.log(`Added: ${hall.name}`);
    } catch (err) {
      console.error(`Failed to insert ${hall.name}:`, err.message);
    }
  }

  console.log(`\nDone! Inserted ${inserted} restaurant spots + ${DINING_HALLS.length} dining halls.`);
  process.exit(0);
}

seedSpots().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
