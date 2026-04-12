const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com"],
      frameSrc: ["https://challenges.cloudflare.com"],
      connectSrc: ["'self'", "https://api.mapbox.com", "https://events.mapbox.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      workerSrc: ["blob:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: '10kb' }));

const authRoutes = require('./routes/auth');
const spotsRoutes = require('./routes/spots');
const checkinsRoutes = require('./routes/checkins');
const hopsRoutes = require('./routes/hops');
const leaderboardRoutes = require('./routes/leaderboard');
const directionsRoutes = require('./routes/directions');
const profileRoutes = require('./routes/profile');

app.use('/api/auth', authRoutes);
app.use('/api/spots', spotsRoutes);
app.use('/api/checkins', checkinsRoutes);
app.use('/api/hops', hopsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/directions', directionsRoutes);
app.use('/api/profile', profileRoutes);

app.get('/', (req, res) => {
    res.json({ message : 'A2 Chuds API is running'});
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});