/**
 * License Key Generator Service
 * Generates SHIELD-XXXX-XXXX-XXXX-XXXX format keys
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Generate a license key in SHIELD-XXXX-XXXX-XXXX-XXXX format
 * @returns {string}
 */
function generateLicenseKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segment = (len) => {
    let result = '';
    for (let i = 0; i < len; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  };

  return `SHIELD-${segment(4)}-${segment(4)}-${segment(4)}-${segment(4)}`;
}

/**
 * Generate a secure random site secret token (UUID v4)
 * @returns {string}
 */
function generateSiteToken() {
  return uuidv4();
}

module.exports = { generateLicenseKey, generateKey: generateLicenseKey, generateSiteToken };
