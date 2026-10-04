/**
 * Shield Pro Portal - SQLite Database Schema
 * Initializes all tables and seeds the default admin account.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const path = require('path');
const { getDb } = require('./db');

const DB_PATH = process.env.DB_PATH || './database/portal.db';
const db = getDb();

/**
 * Create all tables
 */
db.exec(`
  -- Admin table (single super-admin account)
  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'User',
    status TEXT NOT NULL DEFAULT 'active',
    max_sites INTEGER NOT NULL DEFAULT 10,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  -- License Keys table
  CREATE TABLE IF NOT EXISTS license_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    license_key TEXT UNIQUE NOT NULL,
    max_activations INTEGER NOT NULL DEFAULT 10,
    current_activations INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Connected Websites table
  CREATE TABLE IF NOT EXISTS connected_sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    license_key_id INTEGER REFERENCES license_keys(id) ON DELETE SET NULL,
    domain TEXT NOT NULL,
    site_name TEXT,
    site_url TEXT NOT NULL,
    site_secret_token TEXT NOT NULL,
    wc_consumer_key TEXT,
    wc_consumer_secret TEXT,
    stripe_account_id TEXT,
    stripe_pk_encrypted TEXT,
    stripe_sk_encrypted TEXT,
    plugin_version TEXT,
    wp_version TEXT,
    wc_version TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    last_sync DATETIME,
    activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Stripe Account Logs
  CREATE TABLE IF NOT EXISTS stripe_account_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL REFERENCES connected_sites(id) ON DELETE CASCADE,
    stripe_account_id TEXT,
    event_type TEXT NOT NULL,
    total_sales REAL DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    last_status TEXT,
    details TEXT,
    logged_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Activity Logs
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_type TEXT NOT NULL DEFAULT 'user',
    actor_id INTEGER,
    actor_email TEXT,
    site_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_license_keys_user ON license_keys(user_id);
  CREATE INDEX IF NOT EXISTS idx_license_keys_key ON license_keys(license_key);
  CREATE INDEX IF NOT EXISTS idx_sites_user ON connected_sites(user_id);
  CREATE INDEX IF NOT EXISTS idx_sites_domain ON connected_sites(domain);
  CREATE INDEX IF NOT EXISTS idx_sites_token ON connected_sites(site_secret_token);
  CREATE INDEX IF NOT EXISTS idx_logs_actor ON activity_logs(actor_id);
  CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at);
`);

/**
 * Seed admin account if not exists
 */
const adminEmail = process.env.ADMIN_EMAIL || 'admin@azeemgreater.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'ShieldAdmin@2026!';

const existingAdmin = db.prepare('SELECT id FROM admin WHERE email = ?').get(adminEmail);
if (!existingAdmin) {
  const hash = bcrypt.hashSync(adminPassword, 12);
  db.prepare('INSERT INTO admin (email, password_hash) VALUES (?, ?)').run(adminEmail, hash);
  console.log(`✅ Admin account created: ${adminEmail}`);
} else {
  console.log(`ℹ️  Admin account already exists: ${adminEmail}`);
}

console.log('✅ Database schema initialized successfully');
console.log(`📁 Database location: ${path.resolve(DB_PATH)}`);

module.exports = db;
