/**
 * Admin-only route guard middleware.
 * Must be used AFTER authMiddleware.
 */

function adminOnly(req, res, next) {
  if (!req.actor || req.actor.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  next();
}

module.exports = { adminOnly };
