/**
 * Admin Panel Management Routes
 * Protected with authMiddleware and adminOnly.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { adminOnly } = require('../middleware/adminOnly');
const { generateKey } = require('../services/keyGenerator');
const { logActivity, getClientIp } = require('../services/logger');

// Protect all admin routes
router.use(authMiddleware, adminOnly);

/**
 * GET /api/admin/stats
 * Overview dashboard metrics
 */
router.get('/stats', (req, res) => {
  const db = getDb();

  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const activeUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'active'").get().count;
  const totalKeys = db.prepare('SELECT COUNT(*) as count FROM license_keys').get().count;
  const activeKeys = db.prepare("SELECT COUNT(*) as count FROM license_keys WHERE status = 'active'").get().count;
  const totalSites = db.prepare('SELECT COUNT(*) as count FROM connected_sites').get().count;
  const activeSites = db.prepare("SELECT COUNT(*) as count FROM connected_sites WHERE status = 'active'").get().count;
  const totalLogs = db.prepare('SELECT COUNT(*) as count FROM activity_logs').get().count;

  return res.json({
    success: true,
    stats: {
      users: { total: totalUsers, active: activeUsers },
      keys: { total: totalKeys, active: activeKeys },
      sites: { total: totalSites, active: activeSites },
      total_logs: totalLogs,
    },
  });
});

/**
 * GET /api/admin/users
 * List all users with their site and license stats
 */
router.get('/users', (req, res) => {
  const db = getDb();

  const users = db.prepare(`
    SELECT 
      u.id, u.email, u.name, u.status, u.max_sites, u.notes, 
      u.created_at, u.last_login,
      COUNT(DISTINCT s.id) as sites_count,
      COUNT(DISTINCT l.id) as keys_count
    FROM users u
    LEFT JOIN connected_sites s ON u.id = s.user_id
    LEFT JOIN license_keys l ON u.id = l.user_id
    GROUP BY u.id
    ORDER BY u.id DESC
  `).all();

  return res.json({ success: true, users });
});

/**
 * POST /api/admin/users
 * Create a new portal user
 */
router.post('/users', (req, res) => {
  const { email, password, name, max_sites = 10, notes, auto_generate_key = true } = req.body;
  const ip = getClientIp(req);

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const db = getDb();

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
  if (existing) {
    return res.status(400).json({ error: 'A user with this email already exists' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(`
    INSERT INTO users (email, password_hash, name, max_sites, notes, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(cleanEmail, hash, name || 'User', Number(max_sites) || 10, notes || null);

  const userId = result.lastInsertRowid;
  let newKey = null;

  if (auto_generate_key) {
    const generated = generateKey();
    db.prepare(`
      INSERT INTO license_keys (user_id, license_key, max_activations, current_activations, status)
      VALUES (?, ?, ?, 0, 'active')
    `).run(userId, generated, Number(max_sites) || 10);
    newKey = generated;
  }

  logActivity({
    actorType: 'admin',
    actorId: req.actor.id,
    actorEmail: req.actor.email,
    action: 'admin.create_user',
    details: { user_id: userId, email: cleanEmail, generated_key: newKey },
    ip,
  });

  return res.json({
    success: true,
    message: 'User created successfully',
    user_id: userId,
    license_key: newKey,
  });
});

/**
 * GET /api/admin/users/:id/details
 * Full user details with connected sites and keys
 */
router.get('/users/:id/details', (req, res) => {
  const db = getDb();
  const userId = req.params.id;

  const user = db.prepare('SELECT id, email, name, status, max_sites, notes, created_at, last_login FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const keys = db.prepare('SELECT * FROM license_keys WHERE user_id = ? ORDER BY id DESC').all(userId);
  const sites = db.prepare('SELECT * FROM connected_sites WHERE user_id = ? ORDER BY id DESC').all(userId);

  return res.json({
    success: true,
    user,
    keys,
    sites,
  });
});

/**
 * PUT /api/admin/users/:id
 * Update user status, site limits, or password
 */
router.put('/users/:id', (req, res) => {
  const db = getDb();
  const userId = req.params.id;
  const { name, max_sites, status, notes, password } = req.body;

  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (password && password.trim().length >= 6) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  }

  db.prepare(`
    UPDATE users SET
      name = COALESCE(?, name),
      max_sites = COALESCE(?, max_sites),
      status = COALESCE(?, status),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name || null,
    max_sites !== undefined ? Number(max_sites) : null,
    status || null,
    notes !== undefined ? notes : null,
    userId
  );

  logActivity({
    actorType: 'admin',
    actorId: req.actor.id,
    actorEmail: req.actor.email,
    action: 'admin.update_user',
    details: { user_id: userId, changes: req.body },
    ip: getClientIp(req),
  });

  return res.json({ success: true, message: 'User updated successfully' });
});

/**
 * DELETE /api/admin/users/:id
 * Delete user and associated keys/sites
 */
router.delete('/users/:id', (req, res) => {
  const db = getDb();
  const userId = req.params.id;

  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare('DELETE FROM users WHERE id = ?').run(userId);

  logActivity({
    actorType: 'admin',
    actorId: req.actor.id,
    actorEmail: req.actor.email,
    action: 'admin.delete_user',
    details: { user_id: userId, email: user.email },
    ip: getClientIp(req),
  });

  return res.json({ success: true, message: 'User deleted successfully' });
});

/**
 * GET /api/admin/keys
 * List all license keys across all users
 */
router.get('/keys', (req, res) => {
  const db = getDb();

  const keys = db.prepare(`
    SELECT 
      l.id, l.license_key, l.max_activations, l.current_activations, 
      l.status, l.notes, l.created_at,
      u.id as user_id, u.email as user_email, u.name as user_name
    FROM license_keys l
    JOIN users u ON l.user_id = u.id
    ORDER BY l.id DESC
  `).all();

  return res.json({ success: true, keys });
});

/**
 * POST /api/admin/keys
 * Generate a new license key for a user
 */
router.post('/keys', (req, res) => {
  const { user_id, max_activations = 10, notes } = req.body;
  if (!user_id) return res.status(400).json({ error: 'User ID is required' });

  const db = getDb();
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const key = generateKey();
  db.prepare(`
    INSERT INTO license_keys (user_id, license_key, max_activations, current_activations, status, notes)
    VALUES (?, ?, ?, 0, 'active', ?)
  `).run(user_id, key, Number(max_activations) || 10, notes || null);

  logActivity({
    actorType: 'admin',
    actorId: req.actor.id,
    actorEmail: req.actor.email,
    action: 'admin.create_key',
    details: { user_id, license_key: key },
    ip: getClientIp(req),
  });

  return res.json({ success: true, license_key: key });
});

/**
 * PUT /api/admin/keys/:id
 * Toggle key status or update activations limit
 */
router.put('/keys/:id', (req, res) => {
  const db = getDb();
  const keyId = req.params.id;
  const { status, max_activations, notes } = req.body;

  const keyRecord = db.prepare('SELECT * FROM license_keys WHERE id = ?').get(keyId);
  if (!keyRecord) return res.status(404).json({ error: 'License key not found' });

  db.prepare(`
    UPDATE license_keys SET
      status = COALESCE(?, status),
      max_activations = COALESCE(?, max_activations),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    status || null,
    max_activations !== undefined ? Number(max_activations) : null,
    notes !== undefined ? notes : null,
    keyId
  );

  return res.json({ success: true, message: 'License key updated' });
});

/**
 * DELETE /api/admin/keys/:id
 * Revoke/delete a license key
 */
router.delete('/keys/:id', (req, res) => {
  const db = getDb();
  const keyId = req.params.id;

  db.prepare('DELETE FROM license_keys WHERE id = ?').run(keyId);
  return res.json({ success: true, message: 'License key removed' });
});

/**
 * GET /api/admin/logs
 * Activity logs with pagination
 */
router.get('/logs', (req, res) => {
  const db = getDb();
  const { page = 1, limit = 50, action, actor_email } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let whereClauses = [];
  let params = [];

  if (action) {
    whereClauses.push('action LIKE ?');
    params.push(`%${action}%`);
  }
  if (actor_email) {
    whereClauses.push('actor_email LIKE ?');
    params.push(`%${actor_email}%`);
  }

  const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) as count FROM activity_logs ${whereStr}`).get(...params).count;

  const logs = db.prepare(`
    SELECT * FROM activity_logs
    ${whereStr}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  return res.json({
    success: true,
    logs: logs.map(l => ({
      ...l,
      details: l.details ? JSON.parse(l.details) : null,
    })),
    total,
    page: Number(page),
    totalPages: Math.ceil(total / Number(limit)),
  });
});

module.exports = router;
