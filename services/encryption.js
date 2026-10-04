/**
 * Encryption Service
 * AES-256-CBC encryption for sensitive data (Stripe keys, etc.)
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const RAW_KEY = process.env.ENCRYPTION_KEY || 'DefaultKey32CharsChangeMeNow1234';

// Derive a 32-byte key from whatever string is provided
const ENCRYPTION_KEY = crypto.createHash('sha256').update(RAW_KEY).digest();

/**
 * Encrypt a string value
 * @param {string} text - Plain text to encrypt
 * @returns {string} - "iv:encryptedData" hex string
 */
function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an encrypted string
 * @param {string} encryptedText - "iv:encryptedData" hex string
 * @returns {string} - Plain text
 */
function decrypt(encryptedText) {
  if (!encryptedText) return '';
  const [ivHex, encrypted] = encryptedText.split(':');
  if (!ivHex || !encrypted) return '';
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encrypt, decrypt };
