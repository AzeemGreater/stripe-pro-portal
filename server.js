/**
 * Shield Pro Portal - Express Server
 * Hostinger & GitHub CI/CD Ready Node.js Application
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Database initialization
const { getDb } = require('./database/db');
require('./database/schema');

// Import routes
const authRoutes = require('./routes/auth');
const licenseRoutes = require('./routes/license');
const sitesRoutes = require('./routes/sites');
const settingsRoutes = require('./routes/settings');
const ordersRoutes = require('./routes/orders');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'https://*'],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Shield-Token'],
  })
);

// Body parsers
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Rate limiter for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per window
  message: { error: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth/login', authLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/sites', sitesRoutes);
app.use('/api/sites', settingsRoutes);
app.use('/api/sites', ordersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Shield Pro Portal',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Plugin download endpoint
app.get(['/download/plugin', '/api/plugin/download'], (req, res) => {
  const pluginZip = path.join(__dirname, 'woocommerce-gateway-stripe-portal-ready.zip');
  const fs = require('fs');
  if (fs.existsSync(pluginZip)) {
    return res.download(pluginZip, 'woocommerce-gateway-stripe.zip');
  }
  return res.status(404).send('Plugin zip not found on server.');
});

// Serve frontend static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Client-side routes / Fallback to appropriate pages
app.get('/admin*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});

app.get('/user*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user', 'dashboard.html'));
});

// Fallback to login for any other unknown frontend route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Phusion Passenger / Hostinger requires app.listen() to be called directly without require.main guard
const listenPort = process.env.PORT || 3000;
const server = app.listen(listenPort, () => {
  console.log(`===============================================`);
  console.log(`🛡️  Shield Pro Portal running on port ${listenPort}`);
  console.log(`🌐 Local URL: http://localhost:${listenPort}`);
  console.log(`🌐 Production URL: ${process.env.PORTAL_URL || 'https://neoxds.com'}`);
  console.log(`📅 Started at: ${new Date().toLocaleString()}`);
  console.log(`===============================================`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down server gracefully...');
  server.close(() => {
    console.log('Server terminated.');
    process.exit(0);
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { app, server };

