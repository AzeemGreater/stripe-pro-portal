/**
 * Plugin Settings Sync Routes
 * Bridges portal UI to the remote WordPress site's /wp-json/shield/v1/settings endpoint.
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { logActivity, getClientIp } = require('../services/logger');
const { fetchSettings, pushSettings } = require('../services/wordpress');

/**
 * GET /api/sites/:id/settings or /api/settings/:id
 * Fetch current Stripe plugin settings from the remote WordPress website
 */
router.get(['/:id/settings', '/:id'], authMiddleware, async (req, res) => {
  const db = getDb();
  const siteId = req.params.id;

  const site = db.prepare('SELECT * FROM connected_sites WHERE id = ?').get(siteId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  if (req.actor.role !== 'admin' && site.user_id !== req.actor.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const remoteSettings = await fetchSettings(site.site_url, site.site_secret_token);
    return res.json({
      success: true,
      site_id: site.id,
      domain: site.domain,
      settings: remoteSettings,
    });
  } catch (err) {
    console.warn(`Failed to fetch settings from ${site.domain}:`, err.message);

    // Provide default fallback schema so the UI still displays nicely
    return res.json({
      success: true,
      fallback: true,
      error: `Could not fetch live settings from ${site.domain}: ${err.message}`,
      settings: {
        enabled: 'yes',
        title: 'Credit / Debit Card (Stripe)',
        description: 'Pay securely using your credit or debit card.',
        testmode: 'yes',
        statement_descriptor: site.site_name || 'STORE NAME',
        capture: 'yes',
        saved_cards: 'yes',
        inline_cc_form: 'no',
        logging: 'yes',
        // Advanced metadata settings
        metadata_customizer: {
          enabled: 'no',
          store_name: site.site_name || 'BEKAPAINT LIMITED',
          site_url: 'hidden',
          order_description_template: '{store_name} - order {order_number}',
          statement_descriptor_suffix: 'BEKAPAINT',
          mask_level3: 'no',
          mask_customer_pii: 'no',
          strip_shipping: 'no',
        },
      },
    });
  }
});

/**
 * POST /api/sites/:id/settings or /api/settings/:id
 * Push new plugin settings to remote WordPress site
 */
router.post(['/:id/settings', '/:id'], authMiddleware, async (req, res) => {
  const db = getDb();
  const siteId = req.params.id;
  const newSettings = req.body;

  const site = db.prepare('SELECT * FROM connected_sites WHERE id = ?').get(siteId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  if (req.actor.role !== 'admin' && site.user_id !== req.actor.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const result = await pushSettings(site.site_url, site.site_secret_token, newSettings);

    // Update last sync time
    db.prepare("UPDATE connected_sites SET last_sync = datetime('now'), status = 'active' WHERE id = ?").run(siteId);

    logActivity({
      actorType: req.actor.role,
      actorId: req.actor.id,
      actorEmail: req.actor.email,
      siteId: site.id,
      action: 'settings.updated',
      details: { domain: site.domain, changedKeys: Object.keys(newSettings) },
      ip: getClientIp(req),
    });

    return res.json({
      success: true,
      message: 'Settings updated successfully on remote WordPress site.',
      data: result,
    });
  } catch (err) {
    console.error(`Failed to push settings to ${site.domain}:`, err);
    return res.status(502).json({
      success: false,
      error: `Failed to save settings to remote website: ${err.message}`,
    });
  }
});

module.exports = router;
