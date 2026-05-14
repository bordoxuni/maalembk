const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createServer } = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth.routes');
const requestRoutes = require('./routes/request.routes');
const offerRoutes = require('./routes/offer.routes');
const missionRoutes = require('./routes/mission.routes');
const reviewRoutes = require('./routes/review.routes');
const categoryRoutes = require('./routes/category.routes');
const technicianRoutes = require('./routes/technician.routes');
const platformFeeRoutes = require('./routes/platformFee.routes');
const { errorHandler } = require('./middlewares/error.middleware');
const { authenticateSocket, logSocketEvents } = require('./config/socket');
const { setSocketIO } = require('./utils/socketHelper');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Disable caching to ensure fresh data from database
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.get('/', (req, res) => {
  res.json({ message: 'Maalem Tech API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api', missionRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/technician', technicianRoutes);
app.use('/api/platform-fees', platformFeeRoutes);

app.use(errorHandler);

// Create HTTP server
const server = createServer(app);

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Apply authentication middleware
io.use(authenticateSocket);

// Setup event logging and room management
logSocketEvents(io);

// Make io instance available to controllers
setSocketIO(io);

module.exports = { app, io, server };
