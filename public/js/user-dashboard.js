/**
 * Shield Pro Portal - User Dashboard Client Application
 * 100% Feature & Visual Parity with WooCommerce Stripe Plugin
 */

const UserApp = {
  currentUser: null,
  sites: [],
  activeSite: null,
  activeSubTab: 'settings',
  analyticsData: null,
  analyticsSubTab: 'transactions',
  txFilter: 'all',
  searchQuery: '',

  async init() {
    if (!Auth.requireAuth()) return;

    this.bindGlobalEvents();
    await this.loadUserProfile();
    await this.loadSites();
  },

  bindGlobalEvents() {
    document.getElementById('logout-btn')?.addEventListener('click', () => Auth.logout());
    
    // License Modal Triggers
    document.getElementById('show-license-btn')?.addEventListener('click', () => this.openLicenseModal());
    document.getElementById('add-site-tab-btn')?.addEventListener('click', () => this.openLicenseModal());
    document.getElementById('sidebar-add-site-btn')?.addEventListener('click', () => this.openLicenseModal());
    document.getElementById('sidebar-license-btn')?.addEventListener('click', () => this.openLicenseModal());
    
    // License Modal Close Handlers (X button, Done button, backdrop click, ESC)
    document.getElementById('modal-close-x')?.addEventListener('click', () => this.closeLicenseModal());
    document.getElementById('modal-close-btn')?.addEventListener('click', () => this.closeLicenseModal());
    document.getElementById('license-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'license-modal') this.closeLicenseModal();
    });

    // Configure Connection Modal Handlers
    document.getElementById('btn-configure-connection')?.addEventListener('click', () => this.openConfigureConnectionModal());
    document.getElementById('configure-webhook-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openConfigureConnectionModal();
    });
    document.getElementById('conn-modal-close-x')?.addEventListener('click', () => this.closeConfigureConnectionModal());
    document.getElementById('conn-modal-cancel-btn')?.addEventListener('click', () => this.closeConfigureConnectionModal());
    document.getElementById('configure-connection-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'configure-connection-modal') this.closeConfigureConnectionModal();
    });
    document.getElementById('conn-modal-save-btn')?.addEventListener('click', () => this.saveConnectionSettings());

    // Global ESC Key to close any open modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeLicenseModal();
        this.closeConfigureConnectionModal();
      }
    });

    // Sub-tab navigation clicks
    document.querySelectorAll('.wc-stripe-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const subtab = btn.getAttribute('data-subtab');
        if (subtab) this.switchSubTab(subtab);
      });
    });

    // Site actions
    document.getElementById('refresh-site-btn')?.addEventListener('click', () => this.pingCurrentSite());
    document.getElementById('disconnect-site-btn')?.addEventListener('click', () => this.disconnectCurrentSite());

    // Save Settings
    document.getElementById('save-settings-btn')?.addEventListener('click', () => this.saveSettings());

    // Analytics Range
    document.getElementById('analytics-range-select')?.addEventListener('change', (e) => {
      this.loadAnalytics(e.target.value);
    });
    document.getElementById('refresh-analytics-btn')?.addEventListener('click', () => {
      const range = document.getElementById('analytics-range-select').value;
      this.loadAnalytics(range);
    });

    // Orders Filter & Refresh
    document.getElementById('orders-status-filter')?.addEventListener('change', () => this.loadOrders());
    document.getElementById('refresh-orders-btn')?.addEventListener('click', () => this.loadOrders());

    // Advance Tools Inputs (Live preview binding)
    ['tool-meta-enabled', 'tool-mask-level3', 'tool-mask-pii', 'tool-strip-shipping'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.updateLivePreview());
    });

    ['tool-store-name', 'tool-desc-template', 'tool-site-url', 'tool-statement-suffix'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.updateLivePreview());
    });
  },

  async loadUserProfile() {
    try {
      const data = await Auth.api('/api/auth/me');
      this.currentUser = data.user;

      const userDisplay = document.getElementById('user-display-name');
      if (userDisplay) userDisplay.innerText = this.currentUser.name || this.currentUser.email;

      const sidebarEmail = document.getElementById('sidebar-user-email');
      if (sidebarEmail) sidebarEmail.innerText = this.currentUser.email;

      const count = this.currentUser.connected_sites_count || 0;
      const max = this.currentUser.max_sites || 10;
      
      const userQuota = document.getElementById('user-site-quota');
      if (userQuota) userQuota.innerText = `${count}/${max} Sites`;

      const sidebarQuota = document.getElementById('sidebar-user-quota');
      if (sidebarQuota) sidebarQuota.innerText = `${count}/${max}`;

      // Populate license modal
      const emailInput = document.getElementById('modal-email-val');
      if (emailInput) emailInput.value = this.currentUser.email;
      
      const primaryKey = this.currentUser.licenses && this.currentUser.licenses.length > 0 
        ? this.currentUser.licenses[0].license_key 
        : (this.currentUser.license_key || 'No active key assigned');
      
      const keyInput = document.getElementById('modal-key-val');
      if (keyInput) keyInput.value = primaryKey;
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  },

  async loadSites() {
    const loading = document.getElementById('loading-placeholder');
    const empty = document.getElementById('empty-sites-placeholder');
    const viewWrapper = document.getElementById('site-view-wrapper');
    const subNav = document.getElementById('sub-nav-bar');
    const topBar = document.getElementById('main-topbar');

    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if (viewWrapper) viewWrapper.style.display = 'none';
    if (subNav) subNav.style.display = 'none';
    if (topBar) topBar.style.display = 'none';

    try {
      const res = await Auth.api('/api/sites');
      this.sites = res.sites || [];

      if (loading) loading.style.display = 'none';

      const siteCountBadge = document.getElementById('sidebar-site-count');
      if (siteCountBadge) siteCountBadge.innerText = this.sites.length;

      if (this.sites.length === 0) {
        if (empty) empty.style.display = 'block';
        this.renderSidebarSites();
        return;
      }

      if (subNav) subNav.style.display = 'flex';
      if (topBar) topBar.style.display = 'flex';
      if (viewWrapper) viewWrapper.style.display = 'block';

      if (!this.activeSite || !this.sites.some(s => s.id === this.activeSite.id)) {
        this.activeSite = this.sites[0];
      } else {
        this.activeSite = this.sites.find(s => s.id === this.activeSite.id);
      }

      this.renderSidebarSites();
      this.loadSiteData(this.activeSite);
    } catch (err) {
      if (loading) loading.style.display = 'none';
      Auth.showToast(`Error loading sites: ${err.message}`, 'danger');
    }
  },

  renderSidebarSites() {
    const list = document.getElementById('sidebar-sites-list');
    if (!list) return;

    list.innerHTML = '';

    this.sites.forEach(site => {
      const item = document.createElement('div');
      const isActive = this.activeSite && this.activeSite.id === site.id;
      item.className = `sidebar-site-item ${isActive ? 'active' : ''}`;
      
      const displayName = site.site_name || site.domain;
      const isOnline = site.status === 'active';

      item.innerHTML = `
        <div class="sidebar-site-info">
          <span class="sidebar-site-icon">🌐</span>
          <span class="sidebar-site-domain" title="${site.domain}">${displayName}</span>
        </div>
        <span class="sidebar-site-badge" style="${isOnline ? 'background: #dcfce7; color: #15803d;' : 'background: #fef3c7; color: #b45309;'}">
          ${isOnline ? 'Live' : 'Degraded'}
        </span>
      `;

      item.addEventListener('click', () => {
        if (this.activeSite && this.activeSite.id === site.id) return;
        this.activeSite = site;
        this.renderSidebarSites();
        this.loadSiteData(site);
      });

      list.appendChild(item);
    });
  },

  async loadSiteData(site) {
    if (!site) return;

    // Update Topbar Store Info
    const storeNameEl = document.getElementById('topbar-store-name');
    if (storeNameEl) storeNameEl.innerText = site.site_name || site.domain;

    const storeUrlEl = document.getElementById('topbar-store-url');
    if (storeUrlEl) {
      const cleanUrl = site.domain.startsWith('http') ? site.domain : `https://${site.domain}`;
      storeUrlEl.href = cleanUrl;
      storeUrlEl.innerText = `${site.domain} ↗`;
    }

    const storeSubEl = document.getElementById('topbar-store-sub');
    if (storeSubEl) {
      storeSubEl.innerText = `${site.domain} • Connected & Synchronized`;
    }

    const badge = document.getElementById('site-status-indicator');
    if (badge) {
      if (site.status === 'active') {
        badge.className = 'badge badge-success';
        badge.innerText = 'Online';
      } else if (site.status === 'unreachable') {
        badge.className = 'badge badge-warning';
        badge.innerText = 'Unreachable';
      } else {
        badge.className = 'badge badge-muted';
        badge.innerText = site.status;
      }
    }

    // Populate Account Details in Settings tab
    const acctEmail = document.getElementById('account-email-display');
    if (acctEmail) {
      acctEmail.innerText = site.stripe_account_email || this.currentUser?.email || 'seller@store.com';
    }

    const acctId = document.getElementById('account-id-display');
    if (acctId) {
      const pseudoAcct = site.stripe_account_id || ('acct_' + Math.abs(site.id * 10427389).toString(36).toUpperCase());
      acctId.innerText = pseudoAcct;
    }

    const webhookEndpoint = document.getElementById('webhook-endpoint-url');
    if (webhookEndpoint) {
      webhookEndpoint.innerText = `https://${site.domain}/?wc-api=wc_stripe`;
    }

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

    document.querySelectorAll('.wc-stripe-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-subtab') === tabName) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }
    });

    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.style.display = 'none';
    });

    const targetPane = document.getElementById(`tab-content-${tabName}`);
    if (targetPane) targetPane.style.display = 'block';

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
      const res = await Auth.api(`/api/sites/${this.activeSite.id}/settings`);
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
      await Auth.api(`/api/sites/${this.activeSite.id}/settings`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      Auth.showToast('✅ Gateway settings successfully saved to WordPress store!', 'success');
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
      const acc = this.analyticsData.account || {};

      document.getElementById('banner-account-name').innerText = `${this.activeSite.site_name || this.activeSite.domain} (Stripe)`;
      document.getElementById('banner-account-id').innerText = acc.account_id || (this.activeSite.stripe_account_id || 'acct_connected');
      document.getElementById('banner-payout-schedule').innerText = acc.payout_schedule || 'Daily (Automatic)';

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
          b.style.background = '#ffffff';
          b.style.color = 'var(--primary)';
          b.style.fontWeight = '700';
          b.style.borderColor = 'var(--primary)';
        } else {
          b.style.background = '#ffffff';
          b.style.color = 'var(--text-main)';
          b.style.fontWeight = '500';
          b.style.borderColor = 'var(--border-color)';
        }
      }
    });

    const pillsBar = document.getElementById('tx-filter-pills-bar');
    if (pillsBar) {
      pillsBar.style.display = tab === 'transactions' ? 'flex' : 'none';
    }

    this.renderAnalyticsTable();
  },

  filterTransactions(status) {
    this.txFilter = status;
    document.querySelectorAll('#tx-filter-pills-bar .filter-pill').forEach(btn => {
      if (btn.getAttribute('data-txstatus') === status) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    this.renderAnalyticsTable();
  },

  handleAnalyticsSearch(query) {
    this.searchQuery = (query || '').toLowerCase().trim();
    this.renderAnalyticsTable();
  },

  renderAnalyticsTable() {
    const container = document.getElementById('analytics-table-container');
    if (!this.analyticsData) {
      container.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-muted);">No analytics data available</div>';
      return;
    }

    if (this.analyticsSubTab === 'transactions') {
      let list = this.analyticsData.transactions || [];

      // Status filter
      if (this.txFilter !== 'all') {
        list = list.filter(t => t.status === this.txFilter);
      }

      // Search filter
      if (this.searchQuery) {
        list = list.filter(t => 
          (t.id && t.id.toLowerCase().includes(this.searchQuery)) ||
          (t.order_id && t.order_id.toLowerCase().includes(this.searchQuery)) ||
          (t.customer && t.customer.toLowerCase().includes(this.searchQuery)) ||
          (t.email && t.email.toLowerCase().includes(this.searchQuery))
        );
      }

      if (list.length === 0) {
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted);">No Stripe transactions matching current filters.</div>';
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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(tx => `
                <tr>
                  <td><code style="color: var(--primary); font-weight: 700; font-size: 11.5px;">${tx.id}</code></td>
                  <td><strong>${tx.order_id || 'N/A'}</strong></td>
                  <td><strong>${tx.amount_fmt || '$' + tx.amount}</strong></td>
                  <td style="color: var(--success); font-weight: 600;">${tx.net_fmt || '$' + (tx.amount - (tx.fee || 0)).toFixed(2)}</td>
                  <td style="color: var(--text-muted);">${tx.fee_fmt || '$0.00'}</td>
                  <td>
                    <div><strong>${tx.customer || 'Guest'}</strong></div>
                    <div style="font-size: 11px; color: var(--text-muted);">${tx.email || ''}</div>
                  </td>
                  <td>
                    <span class="badge badge-info" style="font-size: 11px;">💳 ${tx.payment_method || 'Card'}</span>
                  </td>
                  <td>
                    <span class="badge ${tx.status === 'succeeded' ? 'badge-success' : (tx.status === 'refunded' ? 'badge-warning' : 'badge-danger')}">
                      ${tx.status}
                    </span>
                  </td>
                  <td style="font-size: 11.5px; color: var(--text-muted);">${tx.created || 'Recent'}</td>
                  <td>
                    <a href="${tx.stripe_url || 'https://dashboard.stripe.com'}" target="_blank" rel="noopener" class="btn-secondary btn-sm" style="font-size: 11px; padding: 3px 8px;">
                      Stripe ↗
                    </a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (this.analyticsSubTab === 'payouts') {
      const payouts = (this.analyticsData.payouts && this.analyticsData.payouts.list) || [];
      if (payouts.length === 0) {
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted);">No bank payouts recorded in this period.</div>';
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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${payouts.map(p => `
                <tr>
                  <td><code style="color: var(--primary); font-size: 11.5px; font-weight: 700;">${p.id}</code></td>
                  <td><strong>${p.amount_fmt || '$' + p.amount}</strong></td>
                  <td>${p.destination || 'Bank Account (•••• 4242)'}</td>
                  <td>${p.arrival || p.created || 'N/A'}</td>
                  <td><span class="badge badge-success">${p.status}</span></td>
                  <td>
                    <a href="${p.stripe_url || 'https://dashboard.stripe.com'}" target="_blank" rel="noopener" class="btn-secondary btn-sm" style="font-size: 11px; padding: 3px 8px;">
                      Stripe ↗
                    </a>
                  </td>
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
          <div style="padding: 50px 20px; text-align: center;">
            <div style="font-size: 40px; margin-bottom: 12px;">🎉</div>
            <h4 style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">Zero Disputes!</h4>
            <p style="font-size: 13px; color: var(--text-muted);">Your store has had no chargebacks or disputes in this period.</p>
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
        container.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted);">No Stripe customer records found in this period.</div>';
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
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${customers.map(c => `
                <tr>
                  <td><code style="color: var(--primary); font-size: 11.5px; font-weight: 700;">${c.id}</code></td>
                  <td><strong>${c.name}</strong></td>
                  <td>${c.email}</td>
                  <td>${c.created}</td>
                  <td>
                    <a href="${c.stripe_url || 'https://dashboard.stripe.com'}" target="_blank" rel="noopener" class="btn-secondary btn-sm" style="font-size: 11px; padding: 3px 8px;">
                      Stripe ↗
                    </a>
                  </td>
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
      const statsRes = await Auth.api(`/api/sites/${this.activeSite.id}/order-stats`);
      if (statsRes.success && statsRes.stats) {
        const st = statsRes.stats;
        document.getElementById('wc-stat-total').innerText = st.total_orders || 0;
        document.getElementById('wc-stat-revenue').innerText = `$${parseFloat(st.total_revenue || 0).toFixed(2)}`;
        document.getElementById('wc-stat-completed').innerText = st.completed || 0;
        document.getElementById('wc-stat-pending').innerText = (st.pending || 0) + (st.processing || 0);
      }

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
            <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${itemsSummary}">
              ${itemsSummary}
            </td>
            <td><strong>$${parseFloat(order.total || 0).toFixed(2)}</strong></td>
            <td><span class="badge badge-info" style="font-size: 11px;">${order.payment_method}</span></td>
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
     SUBTAB 4: ADVANCE TOOLS (100% Privacy & Data Cloaking Suite Parity)
     ------------------------------------------------------------------------ */
  async loadAdvanceTools() {
    if (!this.activeSite) return;

    try {
      const res = await Auth.api(`/api/sites/${this.activeSite.id}/settings`);
      const meta = (res.settings && res.settings.metadata_customizer) || {};

      document.getElementById('tool-meta-enabled').checked = meta.enabled === 'yes' || meta.enabled === true;
      document.getElementById('tool-site-url').value = meta.site_url || 'hidden';
      document.getElementById('tool-store-name').value = meta.store_name || this.activeSite.site_name || 'BEKAPAINT LIMITED';
      document.getElementById('tool-desc-template').value = meta.order_description_template || '{store_name} - order {order_number}';
      document.getElementById('tool-statement-suffix').value = meta.statement_descriptor_suffix || 'BEKAPAINT';

      document.getElementById('tool-mask-level3').checked = meta.mask_level3 === 'yes' || meta.mask_level3 === true;
      document.getElementById('tool-mask-pii').checked = meta.mask_customer_pii === 'yes' || meta.mask_customer_pii === true;
      document.getElementById('tool-strip-shipping').checked = meta.strip_shipping === 'yes' || meta.strip_shipping === true;

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
    const enabled = document.getElementById('tool-meta-enabled').checked;
    const storeName = document.getElementById('tool-store-name').value || 'BEKAPAINT LIMITED';
    const siteUrl = document.getElementById('tool-site-url').value || 'hidden';
    const template = document.getElementById('tool-desc-template').value || '{store_name} - order {order_number}';
    const suffix = document.getElementById('tool-statement-suffix').value || '';
    const maskLevel3 = document.getElementById('tool-mask-level3').checked;
    const maskPii = document.getElementById('tool-mask-pii').checked;
    const stripShipping = document.getElementById('tool-strip-shipping').checked;

    // Suite Active / Disabled indicators
    const suiteIndicator = document.getElementById('tool-suite-indicator');
    const mockPill = document.getElementById('mock-status-pill');
    const mockFooter = document.getElementById('mock-footer-note');

    if (enabled) {
      suiteIndicator.className = 'wc-stripe-status-indicator is-active';
      suiteIndicator.innerText = 'Suite Active';
      mockPill.className = 'wc-stripe-mock-status-pill is-active';
      mockPill.innerText = 'Cloaking Active';
      mockFooter.innerText = 'All active cloaking rules will automatically apply on checkout and payment intents.';
    } else {
      suiteIndicator.className = 'wc-stripe-status-indicator is-disabled';
      suiteIndicator.innerText = 'Disabled (Default OFF)';
      mockPill.className = 'wc-stripe-mock-status-pill is-off';
      mockPill.innerText = 'Default State (Disabled)';
      mockFooter.innerText = 'Turn the master switch to ON to activate the cloaking rules.';
    }

    // Description preview
    let desc = template
      .replace(/{store_name}/g, storeName)
      .replace(/{order_number}/g, '1042')
      .replace(/{customer_name}/g, maskPii ? 'Customer #1042' : 'Sarah Jenkins')
      .replace(/{order_date}/g, '2026-10-04')
      .replace(/{order_total}/g, '$129.00');

    document.getElementById('mock-desc-val').innerText = enabled ? desc : 'Your Store Name - Order 1042';

    // Suffix preview
    const suffixRow = document.getElementById('mock-suffix-row');
    if (suffix) {
      suffixRow.style.display = 'block';
      document.getElementById('mock-suffix-val').innerText = enabled ? `STRIPE* ${suffix}` : 'STRIPE* STORE';
    } else {
      suffixRow.style.display = 'none';
    }

    // Product & shipping badges
    const level3Badge = document.getElementById('mock-level3-badge');
    if (enabled && maskLevel3) {
      level3Badge.className = 'wc-stripe-pill-badge is-shielded';
      level3Badge.innerText = 'Level 3 Items: Stripped';
    } else {
      level3Badge.className = 'wc-stripe-pill-badge is-exposed';
      level3Badge.innerText = 'Level 3 Items: Transmitted';
    }

    const shippingBadge = document.getElementById('mock-shipping-badge');
    if (enabled && stripShipping) {
      shippingBadge.className = 'wc-stripe-pill-badge is-shielded';
      shippingBadge.innerText = 'Shipping Addr: Omitted';
    } else {
      shippingBadge.className = 'wc-stripe-pill-badge is-exposed';
      shippingBadge.innerText = 'Shipping Addr: Transmitted';
    }

    // Metadata box items
    document.getElementById('mock-meta-url').innerText = enabled ? `"${siteUrl}"` : '"https://example.com"';
    document.getElementById('mock-meta-store').innerText = enabled ? `"${storeName}"` : '"My WooCommerce Store"';
    document.getElementById('mock-meta-cust').innerText = enabled && maskPii ? '"Customer #1042"' : '"Sarah Jenkins"';
    document.getElementById('mock-meta-email').innerText = enabled && maskPii ? '"customer1042@hidden.local"' : '"sarah@example.com"';
  },

  async saveAdvanceTools() {
    if (!this.activeSite) return;
    const btn = document.getElementById('save-tools-btn');
    btn.disabled = true;
    btn.innerText = 'Saving...';

    const payload = {
      metadata_customizer: {
        enabled: document.getElementById('tool-meta-enabled').checked ? 'yes' : 'no',
        site_url: document.getElementById('tool-site-url').value.trim(),
        store_name: document.getElementById('tool-store-name').value.trim(),
        order_description_template: document.getElementById('tool-desc-template').value.trim(),
        statement_descriptor_suffix: document.getElementById('tool-statement-suffix').value.trim(),
        mask_level3: document.getElementById('tool-mask-level3').checked ? 'yes' : 'no',
        mask_customer_pii: document.getElementById('tool-mask-pii').checked ? 'yes' : 'no',
        strip_shipping: document.getElementById('tool-strip-shipping').checked ? 'yes' : 'no',
      },
    };

    try {
      await Auth.api(`/api/sites/${this.activeSite.id}/settings`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      Auth.showToast('✅ Privacy & Cloaking Suite saved to WordPress plugin!', 'success');
    } catch (err) {
      Auth.showToast(`Failed to save: ${err.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerText = '💾 Save Privacy Settings';
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
    const btn = document.getElementById('disconnect-site-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerText = 'Disconnecting...';
    }

    try {
      const res = await Auth.api(`/api/sites/${siteId}`, { method: 'DELETE' });
      Auth.showToast(res.message || 'Site disconnected, Stripe disabled, and license deactivated.', 'success');
      this.activeSite = null;
      await this.loadUserProfile();
      await this.loadSites();
    } catch (err) {
      Auth.showToast(`Failed to disconnect: ${err.message}`, 'danger');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerText = 'Disconnect';
      }
    }
  },

  /* ------------------------------------------------------------------------
     MODALS & UTILS
     ------------------------------------------------------------------------ */
  openLicenseModal() {
    const modal = document.getElementById('license-modal');
    if (modal) modal.style.display = 'flex';
  },

  closeLicenseModal() {
    const modal = document.getElementById('license-modal');
    if (modal) modal.style.display = 'none';
  },

  openConfigureConnectionModal() {
    if (!this.activeSite) {
      Auth.showToast('Please select or connect a site first.', 'warning');
      return;
    }
    const storeNameEl = document.getElementById('conn-store-name');
    if (storeNameEl) storeNameEl.innerText = this.activeSite.site_name || this.activeSite.domain;

    const webhookUrlEl = document.getElementById('conn-webhook-url');
    if (webhookUrlEl) webhookUrlEl.value = `https://${this.activeSite.domain}/?wc-api=wc_stripe`;

    const modal = document.getElementById('configure-connection-modal');
    if (modal) modal.style.display = 'flex';
  },

  closeConfigureConnectionModal() {
    const modal = document.getElementById('configure-connection-modal');
    if (modal) modal.style.display = 'none';
  },

  async saveConnectionSettings() {
    if (!this.activeSite) return;
    const saveBtn = document.getElementById('conn-modal-save-btn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerText = 'Saving...';
    }

    const webhookSecret = document.getElementById('conn-webhook-secret')?.value.trim();
    const pubKey = document.getElementById('conn-publishable-key')?.value.trim();
    const secKey = document.getElementById('conn-secret-key')?.value.trim();

    try {
      // Send keys & webhook config to the site settings route
      await Auth.api(`/api/sites/${this.activeSite.id}/settings`, {
        method: 'POST',
        body: JSON.stringify({
          webhook_secret: webhookSecret,
          publishable_key: pubKey,
          secret_key: secKey,
        }),
      });

      // Update local badges
      const webhookBadge = document.getElementById('badge-webhook-status');
      if (webhookBadge) {
        webhookBadge.style.background = '#e6f9ed';
        webhookBadge.style.color = '#16a34a';
        webhookBadge.innerText = 'Enabled';
      }

      Auth.showToast('✅ Connection settings applied successfully!', 'success');
      this.closeConfigureConnectionModal();
    } catch (err) {
      Auth.showToast(`Connection update: ${err.message}`, 'info');
      this.closeConfigureConnectionModal();
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Save & Apply';
      }
    }
  },

  copyText(elementId) {
    const input = document.getElementById(elementId);
    if (!input) return;
    input.select();
    input.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(input.value);
    Auth.showToast('Copied to clipboard!', 'info');
  },
};

// Bind to window so inline onclick handlers and console calls work reliably
window.UserApp = UserApp;

// Initialize when DOM ready
document.addEventListener('DOMContentLoaded', () => {
  UserApp.init();
});
