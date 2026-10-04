/**
 * Activity Logger Service
 * Logs all important portal actions to the activity_logs table
 */

const { getDb } = require('../database/db');

/**
 * Log an activity
 * @param {object} options
 * @param {string} options.actorType - 'user' | 'admin' | 'system' | 'plugin'
 * @param {number} [options.actorId] - User/admin ID
 * @param {string} [options.actorEmail] - User/admin email
 * @param {number} [options.siteId] - Connected site ID
 * @param {string} options.action - Action name (e.g., 'user.login', 'site.activated')
 * @param {object} [options.details] - Additional details JSON
 * @param {string} [options.ip] - IP address
 */
function logActivity({ actorType = 'user', actorId, actorEmail, siteId, action, details, ip }) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO activity_logs (actor_type, actor_id, actor_email, site_id, action, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      actorType,
      actorId || null,
      actorEmail || null,
      siteId || null,
      action,
      details ? JSON.stringify(details) : null,
      ip || null
    );
  } catch (err) {
    console.error('Activity log error:', err.message);
  }
}

/**
 * Get client IP from request
 * @param {object} req - Express request
 * @returns {string}
 */
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

module.exports = { logActivity, getClientIp };
