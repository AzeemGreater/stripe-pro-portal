/**
 * WooCommerce Orders Routes
 * Fetches real WooCommerce store orders and revenue stats via WooCommerce REST API.
 */

const express = require('express');
const router = express.Router();
const { getDb } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');
const { fetchOrders, fetchOrderStats } = require('../services/woocommerce');

/**
 * GET /api/sites/:id/orders
 * Fetch WooCommerce orders for a specific connected site
 */
router.get('/:id/orders', authMiddleware, async (req, res) => {
  const db = getDb();
  const siteId = req.params.id;

  const site = db.prepare('SELECT * FROM connected_sites WHERE id = ?').get(siteId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  if (req.actor.role !== 'admin' && site.user_id !== req.actor.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Check if WC keys are configured
  if (!site.wc_consumer_key || !site.wc_consumer_secret) {
    return res.json({
      success: true,
      has_keys: false,
      message: 'WooCommerce REST API keys not configured for this website. Please add Consumer Key and Secret in site settings.',
      orders: [],
      total: 0,
      totalPages: 0,
    });
  }

  try {
    const { page = 1, per_page = 20, status } = req.query;
    const result = await fetchOrders(
      site.site_url,
      site.wc_consumer_key,
      site.wc_consumer_secret,
      { page, per_page, ...(status && { status }) }
    );

    return res.json({
      success: true,
      has_keys: true,
      domain: site.domain,
      ...result,
    });
  } catch (err) {
    console.error(`Failed to fetch orders from ${site.domain}:`, err.message);
    return res.status(502).json({
      success: false,
      has_keys: true,
      error: `Could not fetch orders from store: ${err.message}`,
      orders: [],
      total: 0,
      totalPages: 0,
    });
  }
});

/**
 * GET /api/sites/:id/order-stats
 * Fetch WooCommerce order metrics (revenue, counts)
 */
router.get('/:id/order-stats', authMiddleware, async (req, res) => {
  const db = getDb();
  const siteId = req.params.id;

  const site = db.prepare('SELECT * FROM connected_sites WHERE id = ?').get(siteId);
  if (!site) return res.status(404).json({ error: 'Site not found' });

  if (req.actor.role !== 'admin' && site.user_id !== req.actor.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!site.wc_consumer_key || !site.wc_consumer_secret) {
    return res.json({
      success: true,
      has_keys: false,
      stats: { total_orders: 0, total_revenue: '0.00', completed: 0, pending: 0, processing: 0 },
    });
  }

  try {
    const stats = await fetchOrderStats(site.site_url, site.wc_consumer_key, site.wc_consumer_secret);
    return res.json({ success: true, has_keys: true, stats });
  } catch (err) {
    return res.json({
      success: false,
      has_keys: true,
      error: err.message,
      stats: { total_orders: 0, total_revenue: '0.00', completed: 0, pending: 0, processing: 0 },
    });
  }
});

module.exports = router;
