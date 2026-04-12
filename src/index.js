const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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