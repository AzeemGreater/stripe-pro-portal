/**
 * Shield Pro Portal - Database Sanitization Script
 * Resets database to pristine production state:
 * - Wipes all test users
 * - Wipes all test connected sites
 * - Wipes all test license keys
 * - Wipes all test activity logs and stripe account logs
 * - Preserves or re-seeds the Super Admin account
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getDb } = require('./db');

function cleanDatabase() {
  const db = getDb();
  console.log('🧹 Starting database sanitization...');

  // 1. Delete all connected sites
  const deletedSites = db.prepare('DELETE FROM connected_sites').run();
  console.log(`- Removed ${deletedSites.changes} connected site(s)`);

  // 2. Delete all license keys
  const deletedKeys = db.prepare('DELETE FROM license_keys').run();
  console.log(`- Removed ${deletedKeys.changes} license key(s)`);

  // 3. Delete all client users
  const deletedUsers = db.prepare('DELETE FROM users').run();
  console.log(`- Removed ${deletedUsers.changes} user account(s)`);

  // 4. Delete logs
  const deletedLogs = db.prepare('DELETE FROM activity_logs').run();
  console.log(`- Removed ${deletedLogs.changes} activity log(s)`);

  const deletedStripeLogs = db.prepare('DELETE FROM stripe_account_logs').run();
  console.log(`- Removed ${deletedStripeLogs.changes} stripe account log(s)`);

  // 5. Reset autoincrement counters for fresh start
  try {
    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('users', 'connected_sites', 'license_keys', 'activity_logs', 'stripe_account_logs')").run();
    console.log('- Reset SQLite autoincrement sequences');
  } catch (e) {
    // Ignored if sqlite_sequence does not exist
  }

  // 6. Ensure Super Admin account exists and is valid
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@azeemgreater.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'ShieldAdmin@2026!';

  const existingAdmin = db.prepare('SELECT id FROM admin WHERE email = ?').get(adminEmail);
  if (!existingAdmin) {
    const hash = bcrypt.hashSync(adminPassword, 12);
    db.prepare('INSERT INTO admin (email, password_hash) VALUES (?, ?)').run(adminEmail, hash);
    console.log(`✅ Super Admin created: ${adminEmail}`);
  } else {
    console.log(`✅ Super Admin preserved: ${adminEmail}`);
  }

  // 7. Add initial clean audit log
  db.prepare(`
    INSERT INTO activity_logs (actor_type, actor_email, action, details)
    VALUES ('system', ?, 'database.sanitized', '{"message": "Database purged of all test and dummy data"}')
  `).run(adminEmail);

  console.log('✨ Database is now 100% clean and ready for live production use!');
}

if (require.main === module) {
  cleanDatabase();
}

module.exports = { cleanDatabase };
