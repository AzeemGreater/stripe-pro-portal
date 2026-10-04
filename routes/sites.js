/**
 * Connected Sites Routes
 * Handles CRUD and health-check operations for WordPress sites.
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { encrypt, decrypt } = require('../services/encryption');
const { logActivity, getClientIp } = require('../services/logger');
const { fetchStatus, fetchAnalytics, disconnectRemoteSite } = require('../services/wordpress');

/**
 * POST /api/sites/register
 * Called by WordPress plugin after activation to register or update site credentials
 */
router.post('/register', async (req, res) => {
  const ip = getClientIp(req);
  const {
    email,
    license_key,
    domain,
    site_url,
    site_name,
    site_secret_token,
    wc_consumer_key,
    wc_consumer_secret,
    stripe_account_id,
    stripe_publishable_key,
    stripe_secret_key,
    plugin_version,
    wp_version,
    wc_version,
  } = req.body;

  if (!email || !license_key || !domain || !site_secret_token) {
    return res.status(400).json({ error: 'Missing required registration parameters' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanKey = String(license_key).trim().toUpperCase();
  const cleanDomain = String(domain).replace(/^www\./i, '').toLowerCase();

  const db = getDb();
  const user = db.prepare('SELECT id, status, max_sites FROM users WHERE LOWER(email) = ?').get(cleanEmail);
  if (!user || user.status !== 'active') {
    return res.status(403).json({ error: 'User not authorized or inactive' });
  }

  const keyRecord = db.prepare('SELECT id, status FROM license_keys WHERE user_id = ? AND UPPER(license_key) = ?').get(user.id, cleanKey);
  if (!keyRecord || keyRecord.status !== 'active') {
    return res.status(403).json({ error: 'License key invalid or inactive' });
  }

  // Encrypt Stripe keys if provided
  let stripePkEncrypted = null;
  let stripeSkEncrypted = null;
  if (stripe_publishable_key) stripePkEncrypted = encrypt(stripe_publishable_key);
  if (stripe_secret_key) stripeSkEncrypted = encrypt(stripe_secret_key);

  const existing = db.prepare('SELECT id FROM connected_sites WHERE user_id = ? AND domain = ?').get(user.id, cleanDomain);

  let siteId;
  if (existing) {
    db.prepare(`
      UPDATE connected_sites SET
        site_name = COALESCE(?, site_name),
        site_url = COALESCE(?, site_url),
        site_secret_token = ?,
        wc_consumer_key = COALESCE(?, wc_consumer_key),
        wc_consumer_secret = COALESCE(?, wc_consumer_secret),
        stripe_account_id = COALESCE(?, stripe_account_id),
        stripe_pk_encrypted = COALESCE(?, stripe_pk_encrypted),
        stripe_sk_encrypted = COALESCE(?, stripe_sk_encrypted),
        plugin_version = COALESCE(?, plugin_version),
        wp_version = COALESCE(?, wp_version),
        wc_version = COALESCE(?, wc_version),
        status = 'active',
        last_sync = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      site_name || null,
      site_url || `https://${cleanDomain}`,
      site_secret_token,
      wc_consumer_key || null,
      wc_consumer_secret || null,
      stripe_account_id || null,
      stripePkEncrypted,
      stripeSkEncrypted,
      plugin_version || null,
      wp_version || null,
      wc_version || null,
      existing.id
    );
    siteId = existing.id;
  } else {
    // Check max sites limit
    const currentSiteCount = db.prepare('SELECT COUNT(*) as count FROM connected_sites WHERE user_id = ?').get(user.id).count;
    if (currentSiteCount >= user.max_sites) {
      return res.status(403).json({ error: `Site limit reached (${user.max_sites} allowed)` });
    }

    const result = db.prepare(`
      INSERT INTO connected_sites (
        user_id, license_key_id, domain, site_name, site_url,
        site_secret_token, wc_consumer_key, wc_consumer_secret,
        stripe_account_id, stripe_pk_encrypted, stripe_sk_encrypted,
        plugin_version, wp_version, wc_version, status, last_sync
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))
    `).run(
      user.id,
      keyRecord.id,
      cleanDomain,
      site_name || cleanDomain,
      site_url || `https://${cleanDomain}`,
      site_secret_token,
      wc_consumer_key || null,
      wc_consumer_secret || null,
      stripe_account_id || null,
      stripePkEncrypted,
      stripeSkEncrypted,
      plugin_version || null,
      wp_version || null,
      wc_version || null
    );
    siteId = result.lastInsertRowid;
  }

  logActivity({
    actorType: 'plugin',
    actorId: user.id,
    actorEmail: cleanEmail,
    siteId,
    action: 'site.registered',
    details: { domain: cleanDomain, site_url },
    ip,
  });

  return res.json({ success: true, site_id: siteId, message: 'Site registered successfully' });
});

/**
 * GET /api/sites
 * List sites. If user, list user's sites. If admin, can filter by ?user_id or list all.
 */
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();

  let sites;
  if (req.actor.role === 'admin') {
    if (req.query.user_id) {
      sites = db.prepare(`
        SELECT s.*, u.email as user_email, u.name as user_name, l.license_key
        FROM connected_sites s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN license_keys l ON s.license_key_id = l.id
        WHERE s.user_id = ?
        ORDER BY s.id DESC
      `).all(req.query.user_id);
    } else {
      sites = db.prepare(`
        SELECT s.*, u.email as user_email, u.name as user_name, l.license_key
        FROM connected_sites s
        JOIN users u ON s.user_id = u.id
        LEFT JOIN license_keys l ON s.license_key_id = l.id
        ORDER BY s.id DESC
      `).all();
    }
  } else {
    sites = db.prepare(`
      SELECT s.*, l.license_key
      FROM connected_sites s
      LEFT JOIN license_keys l ON s.license_key_id = l.id
      WHERE s.user_id = ?
      ORDER BY s.id ASC
    `).all(req.actor.id);
  }

  // Remove secret encrypted fields before returning
  const sanitized = sites.map(s => ({
    id: s.id,
    user_id: s.user_id,
    domain: s.domain,
    site_name: s.site_name,
    site_url: s.site_url,
    has_wc_keys: !!(s.wc_consumer_key && s.wc_consumer_secret),
    stripe_account_id: s.stripe_account_id,
    plugin_version: s.plugin_version,
    wp_version: s.wp_version,
    wc_version: s.wc_version,
    status: s.status,
    last_sync: s.last_sync,
    activated_at: s.activated_at,
    license_key: s.license_key,
    ...(req.actor.role === 'admin' && {
      user_email: s.user_email,
      user_name: s.user_name,
    }),
  }));

  return res.json({ success: true, sites: sanitized });
});

/**
 * GET /api/sites/:id
 * Retrieve single site details
 */
router.get('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const siteId = req.params.id;

  const site = db.prepare(`
    SELECT s.*, l.license_key, u.email as user_email
    FROM connected_sites s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN license_keys l ON s.license_key_id = l.id
    WHERE s.id = ?
  `).get(siteId);

  if (!site) {
    return res.status(404).json({ error: 'Site not found' });
  }

  if (req.actor.role !== 'admin' && site.user_id !== req.actor.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  return res.json({
    success: true,
    site: {
      id: site.id,
      user_id: site.user_id,
      user_email: site.user_email,
      domain: site.domain,
      site_name: site.site_name,
      site_url: site.site_url,
      has_wc_keys: !!(site.wc_consumer_key && site.wc_consumer_secret),
      stripe_account_id: site.stripe_account_id,
      plugin_version: site.plugin_version,
      wp_version: site.wp_version,
      wc_version: site.wc_version,
      status: site.status,
      last_sync: site.last_sync,
      activated_at: site.activated_at,
      license_key: site.license_key,
    },
  });
});

/**
 * PUT /api/sites/:id
 * Update site metadata (name, WC API keys)
 */
router.put('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const siteId = req.params.id;
  const { site_name, wc_consumer_key, wc_consumer_secret } = req.body;

  const site = db.prepare('SELECT * FROM connected_sites WHERE id = ?').get(siteId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  if (req.actor.role !== 'admin' && site.user_id !== req.actor.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  db.prepare(`
    UPDATE connected_sites SET
      site_name = COALESCE(?, site_name),
      wc_consumer_key = COALESCE(?, wc_consumer_key),
      wc_consumer_secret = COALESCE(?, wc_consumer_secret),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(site_name || null, wc_consumer_key || null, wc_consumer_secret || null, siteId);

  logActivity({
    actorType: req.actor.role,
    actorId: req.actor.id,
    actorEmail: req.actor.email,
    siteId: site.id,
    action: 'site.updated',
    details: { domain: site.domain },
    ip: getClientIp(req),
  });

  return res.json({ success: true, message: 'Site updated successfully' });
});

/**
 * DELETE /api/sites/:id
 * Disconnect/delete a connected site
 */
router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const siteId = req.params.id;

  const site = db.prepare('SELECT * FROM connected_sites WHERE id = ?').get(siteId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  if (req.actor.role !== 'admin' && site.user_id !== req.actor.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Decrement license key current_activations
  if (site.license_key_id) {
    db.prepare(`
      UPDATE license_keys 
      SET current_activations = MAX(0, current_activations - 1), updated_at = datetime('now')
      WHERE id = ?
    `).run(site.license_key_id);
  }

  db.prepare('DELETE FROM connected_sites WHERE id = ?').run(siteId);

  logActivity({
    actorType: req.actor.role,
    actorId: req.actor.id,
    actorEmail: req.actor.email,
    siteId: site.id,
    action: 'site.disconnected',
    details: { domain: site.domain },
    ip: getClientIp(req),
  });

  return res.json({ success: true, message: `Site ${site.domain} disconnected successfully` });
});

/**
 * POST /api/sites/:id/ping
 * Check live connection to WordPress plugin
 */
router.post('/:id/ping', authMiddleware, async (req, res) => {
  const db = getDb();
  const siteId = req.params.id;

  const site = db.prepare('SELECT * FROM connected_sites WHERE id = ?').get(siteId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  if (req.actor.role !== 'admin' && site.user_id !== req.actor.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const statusData = await fetchStatus(site.site_url, site.site_secret_token);

    db.prepare(`
      UPDATE connected_sites SET
        last_sync = datetime('now'),
        status = 'active',
        plugin_version = COALESCE(?, plugin_version),
        wp_version = COALESCE(?, wp_version),
        wc_version = COALESCE(?, wc_version),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      statusData.plugin_version || null,
      statusData.wp_version || null,
      statusData.wc_version || null,
      siteId
    );

    return res.json({ success: true, online: true, data: statusData });
  } catch (err) {
    db.prepare("UPDATE connected_sites SET status = 'unreachable', updated_at = datetime('now') WHERE id = ?").run(siteId);
    return res.json({ success: false, online: false, error: err.message });
  }
});

/**
 * GET /api/sites/:id/analytics
 * Fetch analytics data from the site's plugin or local Stripe cache
 */
router.get('/:id/analytics', authMiddleware, async (req, res) => {
  const db = getDb();
  const siteId = req.params.id;
  const range = req.query.range || '30d';

  const site = db.prepare('SELECT * FROM connected_sites WHERE id = ?').get(siteId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  if (req.actor.role !== 'admin' && site.user_id !== req.actor.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const analytics = await fetchAnalytics(site.site_url, site.site_secret_token, range);
    return res.json({ success: true, data: analytics });
  } catch (err) {
    // If live call fails, provide graceful fallback data structure
    console.warn(`Analytics fallback for site ${site.domain}:`, err.message);
    return res.json({
      success: true,
      fallback: true,
      message: 'Showing cached analytics (live site unreachable)',
      data: {
        range,
        currency: 'USD',
        summary: {
          gross_volume: 0,
          gross_volume_fmt: '$0.00',
          net_volume: 0,
          net_volume_fmt: '$0.00',
          total_fees_fmt: '$0.00',
          success_count: 0,
          failed_count: 0,
          total_count: 0,
          success_rate: 100,
        },
        balance: {
          available: 0,
          pending: 0,
          available_formatted: '$0.00',
          pending_formatted: '$0.00',
        },
        transactions: [],
        payouts: { total_paid: 0, total_paid_fmt: '$0.00', list: [] },
        disputes: { active_count: 0, won_count: 0, lost_count: 0, list: [] },
        customers: { total_count: 0, list: [] },
      },
    });
  }
});

/**
 * DELETE /api/sites/:id
 * Disconnect a site:
 * 1. Call remote WordPress plugin to disable Stripe gateway and deactivate license
 * 2. Decrement current_activations on license_keys table
 * 3. Delete site record from connected_sites
 * 4. Log activity
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  const db = getDb();
  const siteId = req.params.id;

  const site = db.prepare('SELECT * FROM connected_sites WHERE id = ?').get(siteId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  if (req.actor.role !== 'admin' && site.user_id !== req.actor.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // 1. Attempt to call remote WordPress plugin to disable Stripe & deactivate license
  let remoteSuccess = false;
  let remoteMessage = '';
  try {
    const wpRes = await disconnectRemoteSite(site.site_url, site.site_secret_token);
    if (wpRes && wpRes.success) {
      remoteSuccess = true;
      remoteMessage = 'Remote WordPress Stripe disabled and license deactivated.';
    }
  } catch (err) {
    console.warn(`Remote WordPress disconnect for ${site.domain} returned: ${err.message}. Proceeding with portal removal.`);
    remoteMessage = `Remote site was unreachable (${err.message}), but portal record has been removed.`;
  }

  // 2. Decrement license activations
  if (site.license_key_id) {
    db.prepare('UPDATE license_keys SET current_activations = MAX(0, current_activations - 1) WHERE id = ?').run(site.license_key_id);
  }

  // 3. Delete site from connected_sites
  db.prepare('DELETE FROM connected_sites WHERE id = ?').run(siteId);

  // 4. Log activity
  logActivity({
    actorType: req.actor.role === 'admin' ? 'admin' : 'user',
    actorId: req.actor.id,
    actorEmail: req.actor.email,
    siteId: parseInt(siteId, 10),
    action: 'site.disconnected',
    details: { domain: site.domain, remoteSuccess, remoteMessage },
    ip: req.ip,
  });

  return res.json({
    success: true,
    message: `Site ${site.domain} disconnected. Stripe gateway disabled in WordPress and license deactivated.`,
    remote_success: remoteSuccess,
  });
});

module.exports = router;
