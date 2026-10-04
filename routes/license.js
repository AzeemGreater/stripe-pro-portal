/**
 * License Activation Routes
 * Handles plugin activation requests from WordPress instances.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const { logActivity, getClientIp } = require('../services/logger');

const WP_ACTIVATION_SERVER = process.env.WP_ACTIVATION_SERVER || 'https://azeemgreater.com';

/**
 * POST /api/license/activate
 * Main activation endpoint called by WordPress Plugin
 * Accepts: email, license_key, domain, site_url, site_name, etc.
 */
router.post('/activate', async (req, res) => {
  const ip = getClientIp(req);
  const {
    email,
    license_key,
    domain,
    site_url,
    site_name,
    wc_version,
    wp_version,
    plugin_version,
    wc_consumer_key,
    wc_consumer_secret,
  } = req.body;

  if (!email || !license_key) {
    return res.status(400).json({
      success: false,
      code: 'missing_credentials',
      message: 'Both Email and License Key are required for activation.',
    });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const cleanKey = String(license_key).trim().toUpperCase();
  const rawDomain = domain || (site_url ? new URL(site_url).hostname : 'unknown');
  const cleanDomain = rawDomain.replace(/^www\./i, '').toLowerCase();

  const db = getDb();

  try {
    // 1. Verify User
    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(cleanEmail);
    if (!user) {
      logActivity({
        actorType: 'plugin',
        actorEmail: cleanEmail,
        action: 'license.activate_failed',
        details: { reason: 'user_not_found', key: cleanKey, domain: cleanDomain },
        ip,
      });
      return res.status(404).json({
        success: false,
        code: 'user_not_found',
        message: 'No registered account found with this email. Please check your credentials.',
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        code: 'account_inactive',
        message: 'This account has been suspended or deactivated. Contact support.',
      });
    }

    // 2. Verify License Key
    const keyRecord = db.prepare(`
      SELECT * FROM license_keys 
      WHERE user_id = ? AND UPPER(license_key) = ?
    `).get(user.id, cleanKey);

    if (!keyRecord) {
      logActivity({
        actorType: 'plugin',
        actorId: user.id,
        actorEmail: user.email,
        action: 'license.activate_failed',
        details: { reason: 'invalid_license_key', key: cleanKey, domain: cleanDomain },
        ip,
      });
      return res.status(400).json({
        success: false,
        code: 'invalid_license_key',
        message: 'Invalid license key for this email address.',
      });
    }

    if (keyRecord.status !== 'active') {
      return res.status(403).json({
        success: false,
        code: 'license_inactive',
        message: `This license key is currently ${keyRecord.status}. Please contact administrator.`,
      });
    }

    // 3. Check existing site registration
    let existingSite = db.prepare(`
      SELECT * FROM connected_sites 
      WHERE user_id = ? AND (domain = ? OR site_url = ?)
    `).get(user.id, cleanDomain, site_url || cleanDomain);

    if (!existingSite) {
      // Check max sites limit for user
      const currentSiteCount = db.prepare('SELECT COUNT(*) as count FROM connected_sites WHERE user_id = ?').get(user.id).count;
      if (currentSiteCount >= user.max_sites) {
        return res.status(403).json({
          success: false,
          code: 'site_limit_reached',
          message: `Maximum connected websites limit reached (${user.max_sites} sites allowed). Upgrade your plan or remove an existing site.`,
        });
      }

      // Check key activations limit
      if (keyRecord.current_activations >= keyRecord.max_activations) {
        return res.status(403).json({
          success: false,
          code: 'activation_limit_reached',
          message: `Activation limit reached for this key (${keyRecord.max_activations} activations maximum).`,
        });
      }
    }

    // 4. Generate or maintain site_secret_token
    const siteSecretToken = existingSite ? existingSite.site_secret_token : `sh_${uuidv4().replace(/-/g, '')}`;

    // 5. Insert or Update connected_site
    let siteId;
    if (existingSite) {
      db.prepare(`
        UPDATE connected_sites SET
          license_key_id = ?,
          site_name = COALESCE(?, site_name),
          site_url = COALESCE(?, site_url),
          wc_consumer_key = COALESCE(?, wc_consumer_key),
          wc_consumer_secret = COALESCE(?, wc_consumer_secret),
          plugin_version = COALESCE(?, plugin_version),
          wp_version = COALESCE(?, wp_version),
          wc_version = COALESCE(?, wc_version),
          status = 'active',
          last_sync = datetime('now'),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        keyRecord.id,
        site_name || null,
        site_url || `https://${cleanDomain}`,
        wc_consumer_key || null,
        wc_consumer_secret || null,
        plugin_version || null,
        wp_version || null,
        wc_version || null,
        existingSite.id
      );
      siteId = existingSite.id;
    } else {
      const insertResult = db.prepare(`
        INSERT INTO connected_sites (
          user_id, license_key_id, domain, site_name, site_url, 
          site_secret_token, wc_consumer_key, wc_consumer_secret,
          plugin_version, wp_version, wc_version, status, last_sync
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'))
      `).run(
        user.id,
        keyRecord.id,
        cleanDomain,
        site_name || cleanDomain,
        site_url || `https://${cleanDomain}`,
        siteSecretToken,
        wc_consumer_key || null,
        wc_consumer_secret || null,
        plugin_version || null,
        wp_version || null,
        wc_version || null
      );
      siteId = insertResult.lastInsertRowid;

      // Increment key activations
      db.prepare(`
        UPDATE license_keys 
        SET current_activations = current_activations + 1, updated_at = datetime('now')
        WHERE id = ?
      `).run(keyRecord.id);
    }

    // 6. Log success
    logActivity({
      actorType: 'plugin',
      actorId: user.id,
      actorEmail: user.email,
      siteId,
      action: 'site.activated',
      details: {
        domain: cleanDomain,
        site_url,
        key: cleanKey,
        is_reconnect: !!existingSite,
      },
      ip,
    });

    // 7. Proxy/fetch engine payload from WordPress upstream server if needed
    let payloadBase64 = '';
    let payloadSignature = '';
    let payloadSha256 = '';

    try {
      if (WP_ACTIVATION_SERVER) {
        const upstreamUrl = `${WP_ACTIVATION_SERVER.replace(/\/$/, '')}/wp-json/shield/v1/activate`;
        const upstreamRes = await fetch(upstreamUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            license_key: cleanKey,
            email: cleanEmail,
            domain: cleanDomain,
            site_url: site_url || `https://${cleanDomain}`,
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (upstreamRes.ok) {
          const upstreamData = await upstreamRes.json();
          payloadBase64 = upstreamData.payload_base64 || '';
          payloadSignature = upstreamData.payload_signature || '';
          payloadSha256 = upstreamData.payload_sha256 || '';
        }
      }
    } catch (upstreamErr) {
      console.warn('Upstream activation proxy warning:', upstreamErr.message);
    }

    // Return unified activation response
    return res.json({
      success: true,
      message: 'License verified and website successfully connected to Shield Pro Portal.',
      site_id: siteId,
      site_secret_token: siteSecretToken,
      domain: cleanDomain,
      status: 'active',
      portal_url: process.env.PORTAL_URL || 'https://stripe.azeemgreater.com',
      // Include cryptographic payload for plugin unlocking if retrieved from upstream
      ...(payloadBase64 && {
        payload_base64: payloadBase64,
        payload_signature: payloadSignature,
        payload_sha256: payloadSha256,
      }),
    });
  } catch (error) {
    console.error('License activation error:', error);
    return res.status(500).json({
      success: false,
      code: 'server_error',
      message: 'Internal server error while processing activation.',
    });
  }
});

/**
 * GET /api/license/verify
 * Lightweight check to verify key validity
 */
router.get('/verify', (req, res) => {
  const { key, email } = req.query;
  if (!key || !email) {
    return res.status(400).json({ valid: false, error: 'Key and email required' });
  }

  const db = getDb();
  const user = db.prepare("SELECT id FROM users WHERE LOWER(email) = ? AND status = 'active'").get(String(email).trim().toLowerCase());
  if (!user) return res.json({ valid: false, error: 'User not found or inactive' });

  const record = db.prepare('SELECT status, max_activations, current_activations FROM license_keys WHERE user_id = ? AND UPPER(license_key) = ?').get(user.id, String(key).trim().toUpperCase());
  if (!record || record.status !== 'active') {
    return res.json({ valid: false, error: 'License key not active or invalid' });
  }

  return res.json({
    valid: true,
    activations: `${record.current_activations}/${record.max_activations}`,
  });
});

module.exports = router;
