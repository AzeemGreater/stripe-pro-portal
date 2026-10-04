/**
 * WooCommerce REST API Service
 * Fetches orders from connected WooCommerce sites
 */

/**
 * Fetch orders from WooCommerce REST API
 * @param {string} siteUrl - Site URL
 * @param {string} consumerKey - WC consumer key
 * @param {string} consumerSecret - WC consumer secret
 * @param {object} params - Query params (page, per_page, status, after, before)
 * @returns {Promise<{orders: Array, total: number, totalPages: number}>}
 */
async function fetchOrders(siteUrl, consumerKey, consumerSecret, params = {}) {
  const baseUrl = siteUrl.replace(/\/$/, '');

  const queryParams = new URLSearchParams({
    per_page: params.per_page || 20,
    page: params.page || 1,
    orderby: 'date',
    order: 'desc',
    ...params,
  });

  const url = `${baseUrl}/wp-json/wc/v3/orders?${queryParams}`;

  // WooCommerce uses Basic Auth with consumer key/secret
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`WooCommerce API error ${response.status}: ${text}`);
  }

  const orders = await response.json();
  const total = parseInt(response.headers.get('X-WP-Total') || '0', 10);
  const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1', 10);

  // Clean and format orders for portal display
  const formattedOrders = orders.map(order => ({
    id: order.id,
    number: order.number,
    status: order.status,
    currency: order.currency,
    total: order.total,
    date_created: order.date_created,
    date_modified: order.date_modified,
    customer_email: order.billing?.email || '',
    customer_name: `${order.billing?.first_name || ''} ${order.billing?.last_name || ''}`.trim() || 'Guest',
    payment_method: order.payment_method_title || order.payment_method || '',
    transaction_id: order.transaction_id || '',
    items_count: order.line_items?.length || 0,
    items: (order.line_items || []).map(item => ({
      name: item.name,
      quantity: item.quantity,
      total: item.total,
    })),
  }));

  return { orders: formattedOrders, total, totalPages };
}

/**
 * Fetch WooCommerce order stats
 * @param {string} siteUrl
 * @param {string} consumerKey
 * @param {string} consumerSecret
 * @returns {Promise<object>}
 */
async function fetchOrderStats(siteUrl, consumerKey, consumerSecret) {
  const baseUrl = siteUrl.replace(/\/$/, '');
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  // Get last 30 days orders for stats
  const after = new Date();
  after.setDate(after.getDate() - 30);

  const queryParams = new URLSearchParams({
    per_page: 100,
    page: 1,
    after: after.toISOString(),
    orderby: 'date',
    order: 'desc',
  });

  const url = `${baseUrl}/wp-json/wc/v3/orders?${queryParams}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) return { total_orders: 0, total_revenue: '0', pending: 0, completed: 0 };

  const orders = await response.json();
  const total = parseInt(response.headers.get('X-WP-Total') || orders.length, 10);

  let totalRevenue = 0;
  let completed = 0;
  let pending = 0;
  let processing = 0;

  orders.forEach(order => {
    if (['completed', 'processing'].includes(order.status)) {
      totalRevenue += parseFloat(order.total || 0);
    }
    if (order.status === 'completed') completed++;
    if (order.status === 'pending') pending++;
    if (order.status === 'processing') processing++;
  });

  return {
    total_orders: total,
    total_revenue: totalRevenue.toFixed(2),
    currency: orders[0]?.currency || 'USD',
    completed,
    pending,
    processing,
  };
}

module.exports = { fetchOrders, fetchOrderStats };
