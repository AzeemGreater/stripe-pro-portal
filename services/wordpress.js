/**
 * WordPress REST API Service
 * Communicates with activated WordPress sites via /wp-json/shield/v1/ endpoints
 */

/**
 * Fetch plugin settings from a connected WordPress site
 * @param {string} siteUrl - Site URL
 * @param {string} secretToken - Site secret token
 * @returns {Promise<object>}
 */
async function fetchSettings(siteUrl, secretToken) {
  const url = `${siteUrl.replace(/\/$/, '')}/wp-json/shield/v1/settings`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Shield-Token': secretToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`WP REST API error ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * Push plugin settings to a connected WordPress site
 * @param {string} siteUrl - Site URL
 * @param {string} secretToken - Site secret token
 * @param {object} settings - Settings object
 * @returns {Promise<object>}
 */
async function pushSettings(siteUrl, secretToken, settings) {
  const url = `${siteUrl.replace(/\/$/, '')}/wp-json/shield/v1/settings`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shield-Token': secretToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(settings),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`WP REST API error ${response.status}: ${text}`);
  }

  return response.json();
}

/**
 * Get site status/health from the WordPress plugin
 * @param {string} siteUrl - Site URL
 * @param {string} secretToken - Site secret token
 * @returns {Promise<object>}
 */
async function fetchStatus(siteUrl, secretToken) {
  const url = `${siteUrl.replace(/\/$/, '')}/wp-json/shield/v1/status`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Shield-Token': secretToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Site unreachable: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch analytics data from the WordPress plugin
 * @param {string} siteUrl - Site URL
 * @param {string} secretToken - Site secret token
 * @param {string} range - Date range (24h, 7d, 30d, 90d)
 * @returns {Promise<object>}
 */
async function fetchAnalytics(siteUrl, secretToken, range = '30d') {
  const url = `${siteUrl.replace(/\/$/, '')}/wp-json/shield/v1/analytics?range=${range}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-Shield-Token': secretToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    throw new Error(`Analytics fetch failed: ${response.status}`);
  }

  return response.json();
}

module.exports = { fetchSettings, pushSettings, fetchStatus, fetchAnalytics };
