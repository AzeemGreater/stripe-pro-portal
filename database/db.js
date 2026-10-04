/**
 * Shield Pro Portal - Database Connection
 * Uses native node:sqlite (Node 22+) with fallback to better-sqlite3.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './database/portal.db';

let _db = null;

function getDb() {
  if (_db) return _db;

  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  try {
    const { DatabaseSync } = require('node:sqlite');
    _db = new DatabaseSync(DB_PATH);
    _db.exec('PRAGMA journal_mode = WAL');
    _db.exec('PRAGMA foreign_keys = ON');
    return _db;
  } catch (err) {
    try {
      const Database = require('better-sqlite3');
      _db = new Database(DB_PATH);
      _db.pragma('journal_mode = WAL');
      _db.pragma('foreign_keys = ON');
      return _db;
    } catch (fallbackErr) {
      throw new Error(`Failed to initialize SQLite database: ${err.message}; Fallback: ${fallbackErr.message}`);
    }
  }
}

module.exports = { getDb };
