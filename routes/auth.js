/**
 * Authentication Routes
 * Handles login, session check, and logout for both Admin and Users.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../database/db');
const { authMiddleware, generateToken } = require('../middleware/auth');
const { logActivity, getClientIp } = require('../services/logger');

/**
 * POST /api/auth/login
 * Unified login endpoint for both Admin and Users
 */
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const ip = getClientIp(req);

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const db = getDb();

  // 1. Check if it's the Admin
  const admin = db.prepare('SELECT id, email, password_hash FROM admin WHERE LOWER(email) = ?').get(cleanEmail);

  if (admin) {
    const isPasswordValid = bcrypt.compareSync(password, admin.password_hash);
    if (!isPasswordValid) {
      logActivity({
        actorType: 'admin',
        actorEmail: cleanEmail,
        action: 'auth.login_failed',
        details: { reason: 'invalid_password' },
        ip,
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken({
      id: admin.id,
      email: admin.email,
      name: 'Administrator',
      role: 'admin',
    });

    logActivity({
      actorType: 'admin',
      actorId: admin.id,
      actorEmail: admin.email,
      action: 'admin.login',
      details: { role: 'admin' },
      ip,
    });

    return res.json({
      success: true,
      token,
      user: {
        id: admin.id,
        email: admin.email,
        name: 'Super Admin',
        role: 'admin',
      },
    });
  }

  // 2. Check if it's a regular User
  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(cleanEmail);

  if (!user) {
    logActivity({
      actorType: 'user',
      actorEmail: cleanEmail,
      action: 'auth.login_failed',
      details: { reason: 'user_not_found' },
      ip,
    });
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (user.status === 'suspended') {
    logActivity({
      actorType: 'user',
      actorId: user.id,
      actorEmail: user.email,
      action: 'auth.login_blocked',
      details: { reason: 'account_suspended' },
      ip,
    });
    return res.status(403).json({ error: 'Your account has been suspended. Please contact administrator.' });
  }

  const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
  if (!isPasswordValid) {
    logActivity({
      actorType: 'user',
      actorId: user.id,
      actorEmail: cleanEmail,
      action: 'auth.login_failed',
      details: { reason: 'invalid_password' },
      ip,
    });
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Update last login
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

  // Fetch user's primary license key
  const licenseKey = db.prepare("SELECT license_key, status, max_activations, current_activations FROM license_keys WHERE user_id = ? AND status = 'active' LIMIT 1").get(user.id);

  const token = generateToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: 'user',
  });

  logActivity({
    actorType: 'user',
    actorId: user.id,
    actorEmail: user.email,
    action: 'user.login',
    details: { max_sites: user.max_sites },
    ip,
  });

  return res.json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'user',
      max_sites: user.max_sites,
      license_key: licenseKey ? licenseKey.license_key : null,
    },
  });
});

/**
 * GET /api/auth/me
 * Returns current authenticated user/admin profile
 */
router.get('/me', authMiddleware, (req, res) => {
  const db = getDb();

  if (req.actor.role === 'admin') {
    const admin = db.prepare('SELECT id, email, created_at FROM admin WHERE id = ?').get(req.actor.id);
    if (!admin) {
      return res.status(404).json({ error: 'Admin account not found' });
    }
    return res.json({
      success: true,
      user: {
        id: admin.id,
        email: admin.email,
        name: 'Super Admin',
        role: 'admin',
        created_at: admin.created_at,
      },
    });
  }

  const user = db.prepare('SELECT id, email, name, status, max_sites, created_at, last_login FROM users WHERE id = ?').get(req.actor.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Fetch licenses
  const licenses = db.prepare('SELECT id, license_key, max_activations, current_activations, status, created_at FROM license_keys WHERE user_id = ?').all(user.id);

  // Count connected sites
  const siteCount = db.prepare('SELECT COUNT(*) AS total FROM connected_sites WHERE user_id = ?').get(user.id)?.total || 0;

  return res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      max_sites: user.max_sites,
      created_at: user.created_at,
      last_login: user.last_login,
      role: 'user',
      connected_sites_count: siteCount,
      licenses,
    },
  });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', authMiddleware, (req, res) => {
  logActivity({
    actorType: req.actor.role,
    actorId: req.actor.id,
    actorEmail: req.actor.email,
    action: 'auth.logout',
    ip: getClientIp(req),
  });

  return res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
