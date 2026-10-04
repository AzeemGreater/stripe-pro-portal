/**
 * Shield Pro Portal - User Dashboard Client Application
 * Browser-style multi-website tab manager & plugin remote control.
 */

// Global UserApp Object
const UserApp = {
  currentUser: null,
  sites: [],
  activeSite: null,
  activeSubTab: 'settings',
  analyticsData: null,
  analyticsSubTab: 'transactions',

  async init() {
    if (!Auth.requireAuth()) return;

    this.bindGlobalEvents();
    await this.loadUserProfile();
    await this.loadSites();
  },

  bindGlobalEvents() {
    document.getElementById('logout-btn').addEventListener('click', () => Auth.logout());
    document.getElementById('show-license-btn').addEventListener('click', () => this.openLicenseModal());
    document.getElementById('add-site-tab-btn').addEventListener('click', () => this.openLicenseModal());

    // Sub-tab navigation clicks
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const subtab = btn.getAttribute('data-subtab');
        this.switchSubTab(subtab);
      });
    });

    // Site actions
    document.getElementById('refresh-site-btn').addEventListener('click', () => this.pingCurrentSite());
    document.getElementById('disconnect-site-btn').addEventListener('click', () => this.disconnectCurrentSite());

    // Save Settings
    document.getElementById('save-settings-btn').addEventListener('click', () => this.saveSettings());

    // Analytics Range
    document.getElementById('analytics-range-select').addEventListener('change', (e) => {
      this.loadAnalytics(e.target.value);
    });
    document.getElementById('refresh-analytics-btn').addEventListener('click', () => {
      const range = document.getElementById('analytics-range-select').value;
      this.loadAnalytics(range);
    });

    // Orders Filter & Refresh
    document.getElementById('orders-status-filter').addEventListener('change', () => this.loadOrders());
    document.getElementById('refresh-orders-btn').addEventListener('click', () => this.loadOrders());

    // Advance Tools Inputs (Live preview binding)
    document.getElementById('tool-store-name').addEventListener('input', () => this.updateLivePreview());
    document.getElementById('tool-desc-template').addEventListener('input', () => this.updateLivePreview());
    document.getElementById('tool-site-url').addEventListener('change', () => this.updateLivePreview());
    document.getElementById('save-tools-btn').addEventListener('click', () => this.saveAdvanceTools());
  },

  async loadUserProfile() {
    try {
      const data = await Auth.api('/api/auth/me');
      this.currentUser = data.user;

      document.getElementById('user-display-name').innerText = this.currentUser.name || this.currentUser.email;
      const count = this.currentUser.connected_sites_count || 0;
      const max = this.currentUser.max_sites || 10;
      document.getElementById('user-site-quota').innerText = `${count}/${max} Sites`;

      // Populate license modal
      document.getElementById('modal-email-val').value = this.currentUser.email;
      const primaryKey = this.currentUser.licenses && this.currentUser.licenses.length > 0 
        ? this.currentUser.licenses[0].license_key 
        : (this.currentUser.license_key || 'No active key assigned');
      document.getElementById('modal-key-val').value = primaryKey;
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  },

  async loadSites() {
    const loading = document.getElementById('loading-placeholder');
    const empty = document.getElementById('empty-sites-placeholder');
    const viewWrapper = document.getElementById('site-view-wrapper');
    const subNav = document.getElementById('sub-nav-bar');

    loading.style.display = 'block';
    empty.style.display = 'none';
    viewWrapper.style.display = 'none';
    subNav.style.display = 'none';

    try {
      const res = await Auth.api('/api/sites');
      this.sites = res.sites || [];

      loading.style.display = 'none';

      if (this.sites.length === 0) {
        empty.style.display = 'block';
        this.renderBrowserTabs();
        return;
      }

      // We have sites!
      subNav.style.display = 'flex';
      viewWrapper.style.display = 'block';

      // Set active site (preserve current or pick first)
      if (!this.activeSite || !this.sites.some(s => s.id === this.activeSite.id)) {
        this.activeSite = this.sites[0];
      } else {
        this.activeSite = this.sites.find(s => s.id === this.activeSite.id);
      }

      this.renderBrowserTabs();
      this.loadSiteData(this.activeSite);
    } catch (err) {
      loading.style.display = 'none';
      Auth.showToast(`Error loading sites: ${err.message}`, 'danger');
    }
  },

  renderBrowserTabs() {
    const bar = document.getElementById('browser-tabs-bar');
    const addBtn = document.getElementById('add-site-tab-btn');

    // Remove existing site tabs (keep add button)
    bar.querySelectorAll('.browser-tab').forEach(t => t.remove());

    this.sites.forEach(site => {
      const tab = document.createElement('div');
      const isActive = this.activeSite && this.activeSite.id === site.id;
      tab.className = `browser-tab ${isActive ? 'active' : ''}`;
      tab.innerHTML = `
        <span class="tab-icon">🌐</span>
        <span class="tab-title" title="${site.domain}">${site.site_name || site.domain}</span>
        <span class="tab-close" title="Disconnect site" onclick="event.stopPropagation(); UserApp.promptDisconnect(${site.id}, '${site.domain}')">×</span>
      `;

      tab.addEventListener('click', () => {
        if (this.activeSite && this.activeSite.id === site.id) return;
        this.activeSite = site;
        this.renderBrowserTabs();
        this.loadSiteData(site);
      });

      bar.insertBefore(tab, addBtn);
    });
  },

  async loadSiteData(site) {
    if (!site) return;

    // Update status badge
    const badge = document.getElementById('site-status-indicator');
    if (site.status === 'active') {
      badge.className = 'badge badge-success';
      badge.innerText = 'Active';
    } else if (site.status === 'unreachable') {
      badge.className = 'badge badge-warning';
      badge.innerText = 'Unreachable';
    } else {
      badge.className = 'badge badge-muted';
      badge.innerText = site.status;
    }

    // Load active subtab content
    if (this.activeSubTab === 'settings') {
      this.loadSettings();
    } else if (this.activeSubTab === 'dashboard') {
      this.loadAnalytics();
    } else if (this.activeSubTab === 'orders') {
      this.loadOrders();
    } else if (this.activeSubTab === 'advance_tools') {
      this.loadAdvanceTools();
    }
  },

  switchSubTab(tabName) {
    this.activeSubTab = tabName;

    // Update subtab button styles
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-subtab') === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Toggle panes
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.style.display = 'none';
    });

    const targetPane = document.getElementById(`tab-content-${tabName}`);
    if (targetPane) targetPane.style.display = 'block';

    // Fetch tab-specific data
    if (this.activeSite) {
      if (tabName === 'settings') this.loadSettings();
      if (tabName === 'dashboard') this.loadAnalytics();
      if (tabName === 'orders') this.loadOrders();
      if (tabName === 'advance_tools') this.loadAdvanceTools();
    }
  },

  /* ------------------------------------------------------------------------
     SUBTAB 1: SETTINGS
     ------------------------------------------------------------------------ */
  async loadSettings() {
    if (!this.activeSite) return;
    try {
      const res = await Auth.api(`/api/settings/${this.activeSite.id}/settings`);
      const s = res.settings || {};

      document.getElementById('setting-enabled').checked = s.enabled === 'yes' || s.enabled === true;
      document.getElementById('setting-testmode').checked = s.testmode === 'yes' || s.testmode === true;
      document.getElementById('setting-title').value = s.title || 'Credit / Debit Card (Stripe)';
      document.getElementById('setting-desc').value = s.description || 'Pay securely with your credit or debit card.';
      document.getElementById('setting-statement').value = s.statement_descriptor || this.activeSite.site_name || 'STORE NAME';
      document.getElementById('setting-capture').checked = s.capture !== 'no';
      document.getElementById('setting-savedcards').checked = s.saved_cards !== 'no';
      document.getElementById('setting-inlineform').checked = s.inline_cc_form === 'yes';
      document.getElementById('setting-logging').checked = s.logging !== 'no';

      if (res.fallback) {
        Auth.showToast('Showing default settings. Click Save to push to WordPress.', 'info');
      }
    } catch (err) {
      Auth.showToast(`Error fetching settings: ${err.message}`, 'danger');
    }
  },

  async saveSettings() {
    if (!this.activeSite) return;
    const btn = document.getElementById('save-settings-btn');
    btn.disabled = true;
    btn.innerText = 'Saving...';

    const payload = {
      enabled: document.getElementById('setting-enabled').checked ? 'yes' : 'no',
      testmode: document.getElementById('setting-testmode').checked ? 'yes' : 'no',
      title: document.getElementById('setting-title').value.trim(),
      description: document.getElementById('setting-desc').value.trim(),
      statement_descriptor: document.getElementById('setting-statement').value.trim(),
      capture: document.getElementById('setting-capture').checked ? 'yes' : 'no',
      saved_cards: document.getElementById('setting-savedcards').checked ? 'yes' : 'no',
      inline_cc_form: document.getElementById('setting-inlineform').checked ? 'yes' : 'no',
      logging: document.getElementById('setting-logging').checked ? 'yes' : 'no',
    };

    try {
      const res = await Auth.api(`/api/settings/${this.activeSite.id}/settings`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      Auth.showToast('✅ Settings successfully updated on WordPress store!', 'success');
    } catch (err) {
      Auth.showToast(`Failed to save settings: ${err.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerText = '💾 Save Settings to WordPress';
    }
  },

  /* ------------------------------------------------------------------------
     SUBTAB 2: TRANSACTIONS DASHBOARD & ANALYTICS
     ------------------------------------------------------------------------ */
  async loadAnalytics(range = '30d') {
    if (!this.activeSite) return;

    try {
      const res = await Auth.api(`/api/sites/${this.activeSite.id}/analytics?range=${range}`);
      this.analyticsData = res.data;

      const sum = this.analyticsData.summary || {};
      const bal = this.analyticsData.balance || {};

      document.getElementById('kpi-gross-volume').innerText = sum.gross_volume_fmt || `$${(sum.gross_volume || 0).toFixed(2)}`;
      document.getElementById('kpi-net-volume').innerText = sum.net_volume_fmt || `$${(sum.net_volume || 0).toFixed(2)}`;
      document.getElementById('kpi-fees-sub').innerText = `Stripe Fees: ${sum.total_fees_fmt || '$0.00'}`;
      document.getElementById('kpi-available-bal').innerText = bal.available_formatted || `$${(bal.available || 0).toFixed(2)}`;
      document.getElementById('kpi-pending-sub').innerText = `Pending Payout: ${bal.pending_formatted || '$0.00'}`;
      
      const successRate = sum.success_rate !== undefined ? sum.success_rate : 100;
      document.getElementById('kpi-success-rate').innerText = `${successRate}%`;
      document.getElementById('kpi-success-count').innerText = `${sum.success_count || 0} successful / ${sum.failed_count || 0} failed`;

      this.renderAnalyticsTable();
    } catch (err) {
      Auth.showToast(`Error fetching analytics: ${err.message}`, 'danger');
    }
  },

  switchAnalyticsSubTab(tab) {
    this.analyticsSubTab = tab;
    ['tx', 'payouts', 'disputes', 'customers'].forEach(t => {
      const b = document.getElementById(`subtab-${t}-btn`);
      if (b) {
        if ((t === 'tx' && tab === 'transactions') || t === tab) {
          b.style.background = '#fff';
          b.style.fontWeight = '600';
        } else {
          b.style.background = 'transparent';
          b.style.fontWeight = 'normal';
        }
      }
    });
    this.renderAnalyticsTable();
  },

  renderAnalyticsTable() {
    const container = document.getElementById('analytics-table-container');
    if (!this.analyticsData) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">No data available</div>';
      return;
    }

    if (this.analyticsSubTab === 'transactions') {
      const list = this.analyticsData.transactions || [];
      if (list.length === 0) {
        container.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-muted);">No Stripe transactions recorded in this period.</div>';
        return;
      }
      container.innerHTML = `
        <div class="portal-table-wrap">
          <table class="portal-table">
            <thead>
              <tr>
                <th>Charge ID</th>
                <th>Order</th>
                <th>Amount</th>
                <th>Net</th>
                <th>Fee</th>
                <th>Customer</th>
                <th>Method</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(tx => `
                <tr>
                  <td><code style="color: var(--primary); font-size: 11px;">${tx.id}</code></td>
                  <td><strong>${tx.order_id || 'N/A'}</strong></td>
                  <td><strong>${tx.amount_fmt || '$' + tx.amount}</strong></td>
                  <td style="color: var(--success);">${tx.net_fmt || '$' + (tx.amount - (tx.fee || 0)).toFixed(2)}</td>
                  <td style="color: var(--text-muted);">${tx.fee_fmt || '$0.00'}</td>
                  <td>
                    <div>${tx.customer || 'Guest'}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${tx.email || ''}</div>
                  </td>
                  <td>${tx.payment_method || 'Card'}</td>
                  <td>
                    <span class="badge ${tx.status === 'succeeded' ? 'badge-success' : 'badge-danger'}">
                      ${tx.status}
                    </span>
                  </td>
                  <td style="font-size: 12px; color: var(--text-muted);">${tx.created || 'Recent'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (this.analyticsSubTab === 'payouts') {
      const payouts = (this.analyticsData.payouts && this.analyticsData.payouts.list) || [];
      if (payouts.length === 0) {
        container.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-muted);">No bank payouts recorded in this period.</div>';
        return;
      }
      container.innerHTML = `
        <div class="portal-table-wrap">
          <table class="portal-table">
            <thead>
              <tr>
                <th>Payout ID</th>
                <th>Amount</th>
                <th>Destination</th>
                <th>Arrival Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${payouts.map(p => `
                <tr>
                  <td><code style="color: var(--primary); font-size: 11px;">${p.id}</code></td>
                  <td><strong>${p.amount_fmt || '$' + p.amount}</strong></td>
                  <td>${p.destination || 'Bank Account'}</td>
                  <td>${p.arrival || p.created || 'N/A'}</td>
                  <td><span class="badge badge-success">${p.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (this.analyticsSubTab === 'disputes') {
      const disputes = (this.analyticsData.disputes && this.analyticsData.disputes.list) || [];
      if (disputes.length === 0) {
        container.innerHTML = `
          <div style="padding: 40px 20px; text-align: center;">
            <div style="font-size: 32px; margin-bottom: 8px;">🎉</div>
            <h4 style="font-size: 14px; font-weight: 600; color: var(--text-main);">Zero Disputes!</h4>
            <p style="font-size: 12px; color: var(--text-muted);">Your store has had no chargebacks or disputes in this period.</p>
          </div>
        `;
        return;
      }
      container.innerHTML = `
        <div class="portal-table-wrap">
          <table class="portal-table">
            <thead>
              <tr>
                <th>Dispute ID</th>
                <th>Charge ID</th>
                <th>Amount</th>
                <th>Reason</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${disputes.map(d => `
                <tr>
                  <td><code>${d.id}</code></td>
                  <td><code>${d.charge_id}</code></td>
                  <td><strong>${d.amount_fmt || '$' + d.amount}</strong></td>
                  <td>${d.reason}</td>
                  <td><span class="badge badge-warning">${d.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (this.analyticsSubTab === 'customers') {
      const customers = (this.analyticsData.customers && this.analyticsData.customers.list) || [];
      if (customers.length === 0) {
        container.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-muted);">No Stripe customer records found.</div>';
        return;
      }
      container.innerHTML = `
        <div class="portal-table-wrap">
          <table class="portal-table">
            <thead>
              <tr>
                <th>Customer ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              ${customers.map(c => `
                <tr>
                  <td><code>${c.id}</code></td>
                  <td><strong>${c.name}</strong></td>
                  <td>${c.email}</td>
                  <td>${c.created}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  },

  /* ------------------------------------------------------------------------
     SUBTAB 3: WOOCOMMERCE ORDERS
     ------------------------------------------------------------------------ */
  async loadOrders() {
    if (!this.activeSite) return;

    const tbody = document.getElementById('wc-orders-tbody');
    const warning = document.getElementById('wc-keys-warning');
    const statusFilter = document.getElementById('orders-status-filter').value;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">Loading store orders...</td></tr>';

    try {
      // 1. Load Stats
      const statsRes = await Auth.api(`/api/sites/${this.activeSite.id}/order-stats`);
      if (statsRes.success && statsRes.stats) {
        const st = statsRes.stats;
        document.getElementById('wc-stat-total').innerText = st.total_orders || 0;
        document.getElementById('wc-stat-revenue').innerText = `$${parseFloat(st.total_revenue || 0).toFixed(2)}`;
        document.getElementById('wc-stat-completed').innerText = st.completed || 0;
        document.getElementById('wc-stat-pending').innerText = (st.pending || 0) + (st.processing || 0);
      }

      // 2. Load Orders
      const url = `/api/sites/${this.activeSite.id}/orders${statusFilter ? '?status=' + statusFilter : ''}`;
      const res = await Auth.api(url);

      if (res.has_keys === false) {
        warning.style.display = 'block';
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">Enter WooCommerce REST API credentials above to load orders.</td></tr>';
        return;
      }

      warning.style.display = 'none';

      const orders = res.orders || [];
      if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">No WooCommerce orders found.</td></tr>';
        return;
      }

      tbody.innerHTML = orders.map(order => {
        let badgeClass = 'badge-muted';
        if (order.status === 'completed') badgeClass = 'badge-success';
        if (order.status === 'processing') badgeClass = 'badge-info';
        if (order.status === 'pending' || order.status === 'on-hold') badgeClass = 'badge-warning';
        if (order.status === 'cancelled' || order.status === 'failed') badgeClass = 'badge-danger';

        const itemsSummary = (order.items || []).map(i => `${i.name} (x${i.quantity})`).join(', ') || '1 product';

        return `
          <tr>
            <td><strong>#${order.number || order.id}</strong></td>
            <td style="font-size: 12px; color: var(--text-muted);">${new Date(order.date_created).toLocaleDateString()}</td>
            <td>
              <div><strong>${order.customer_name}</strong></div>
              <div style="font-size: 11px; color: var(--text-muted);">${order.customer_email}</div>
            </td>
            <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${itemsSummary}">
              ${itemsSummary}
            </td>
            <td><strong>$${parseFloat(order.total || 0).toFixed(2)}</strong></td>
            <td><span style="font-size: 12px;">${order.payment_method}</span></td>
            <td><span class="badge ${badgeClass}">${order.status}</span></td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: var(--danger);">Error loading orders: ${err.message}</td></tr>`;
    }
  },

  async saveWcKeys() {
    if (!this.activeSite) return;
    const ck = document.getElementById('input-wc-ck').value.trim();
    const cs = document.getElementById('input-wc-cs').value.trim();

    if (!ck || !cs) {
      Auth.showToast('Please enter both Consumer Key and Secret', 'warning');
      return;
    }

    try {
      await Auth.api(`/api/sites/${this.activeSite.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          wc_consumer_key: ck,
          wc_consumer_secret: cs,
        }),
      });

      Auth.showToast('✅ WooCommerce keys saved! Loading orders...', 'success');
      this.loadOrders();
    } catch (err) {
      Auth.showToast(`Failed to save keys: ${err.message}`, 'danger');
    }
  },

  /* ------------------------------------------------------------------------
     SUBTAB 4: ADVANCE TOOLS
     ------------------------------------------------------------------------ */
  async loadAdvanceTools() {
    if (!this.activeSite) return;

    try {
      const res = await Auth.api(`/api/settings/${this.activeSite.id}/settings`);
      const meta = (res.settings && res.settings.metadata_customizer) || {};

      document.getElementById('tool-meta-enabled').checked = meta.enabled === 'yes' || meta.enabled === true;
      document.getElementById('tool-store-name').value = meta.store_name || this.activeSite.site_name || 'BEKAPAINT LIMITED';
      document.getElementById('tool-site-url').value = meta.site_url || 'hidden';
      document.getElementById('tool-desc-template').value = meta.order_description_template || '{store_name} - order {order_number}';

      this.updateLivePreview();
    } catch (err) {
      console.error('Error loading advance tools:', err);
    }
  },

  insertTemplateTag(tag) {
    const input = document.getElementById('tool-desc-template');
    input.value = input.value ? `${input.value} ${tag}` : tag;
    this.updateLivePreview();
  },

  updateLivePreview() {
    const storeName = document.getElementById('tool-store-name').value || 'BEKAPAINT LIMITED';
    const template = document.getElementById('tool-desc-template').value || '{store_name} - order {order_number}';
    const siteUrlChoice = document.getElementById('tool-site-url').value;

    // Formatted preview
    let desc = template
      .replace(/{store_name}/g, storeName)
      .replace(/{order_number}/g, '1042')
      .replace(/{customer_name}/g, 'Sarah Jenkins')
      .replace(/{order_date}/g, '2026-10-04')
      .replace(/{order_total}/g, '$129.00');

    document.getElementById('preview-brand-val').innerText = storeName;
    document.getElementById('preview-desc-val').innerText = desc;
    document.getElementById('preview-url-val').innerText = siteUrlChoice === 'hidden' ? '[Hidden / Omitted]' : (this.activeSite?.site_url || 'https://mystore.com');
  },

  async saveAdvanceTools() {
    if (!this.activeSite) return;
    const btn = document.getElementById('save-tools-btn');
    btn.disabled = true;
    btn.innerText = 'Saving...';

    const payload = {
      metadata_customizer: {
        enabled: document.getElementById('tool-meta-enabled').checked ? 'yes' : 'no',
        store_name: document.getElementById('tool-store-name').value.trim(),
        site_url: document.getElementById('tool-site-url').value,
        order_description_template: document.getElementById('tool-desc-template').value.trim(),
      },
    };

    try {
      await Auth.api(`/api/settings/${this.activeSite.id}/settings`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      Auth.showToast('✅ Metadata rules saved successfully to WordPress plugin!', 'success');
    } catch (err) {
      Auth.showToast(`Failed to save advance tools: ${err.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerText = '💾 Save Metadata Rules';
    }
  },

  /* ------------------------------------------------------------------------
     SITE MANAGEMENT ACTIONS
     ------------------------------------------------------------------------ */
  async pingCurrentSite() {
    if (!this.activeSite) return;
    const btn = document.getElementById('refresh-site-btn');
    btn.disabled = true;
    btn.innerText = '🔄 Syncing...';

    try {
      const res = await Auth.api(`/api/sites/${this.activeSite.id}/ping`, { method: 'POST' });
      if (res.online) {
        Auth.showToast(`✅ Site ${this.activeSite.domain} is online and synced!`, 'success');
        document.getElementById('site-status-indicator').className = 'badge badge-success';
        document.getElementById('site-status-indicator').innerText = 'Online';
      } else {
        Auth.showToast(`⚠️ Site returned: ${res.error}`, 'warning');
        document.getElementById('site-status-indicator').className = 'badge badge-warning';
        document.getElementById('site-status-indicator').innerText = 'Unreachable';
      }
    } catch (err) {
      Auth.showToast(`Sync failed: ${err.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerText = '🔄 Sync Site';
    }
  },

  promptDisconnect(siteId, domain) {
    if (confirm(`Are you sure you want to disconnect ${domain}? You can reconnect anytime by re-activating in WordPress.`)) {
      this.disconnectSite(siteId);
    }
  },

  disconnectCurrentSite() {
    if (!this.activeSite) return;
    this.promptDisconnect(this.activeSite.id, this.activeSite.domain);
  },

  async disconnectSite(siteId) {
    try {
      await Auth.api(`/api/sites/${siteId}`, { method: 'DELETE' });
      Auth.showToast('Site disconnected successfully.', 'info');
      this.activeSite = null;
      await this.loadUserProfile();
      await this.loadSites();
    } catch (err) {
      Auth.showToast(`Failed to disconnect: ${err.message}`, 'danger');
    }
  },

  /* ------------------------------------------------------------------------
     MODALS & UTILS
     ------------------------------------------------------------------------ */
  openLicenseModal() {
    document.getElementById('license-modal').style.display = 'flex';
  },

  closeLicenseModal() {
    document.getElementById('license-modal').style.display = 'none';
  },

  copyText(elementId) {
    const input = document.getElementById(elementId);
    input.select();
    navigator.clipboard.writeText(input.value);
    Auth.showToast('Copied to clipboard!', 'info');
  },
};

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  UserApp.init();
});
