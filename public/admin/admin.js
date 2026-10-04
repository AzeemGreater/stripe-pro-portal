/**
 * Shield Pro Portal - Admin Console Client Application
 */

const AdminApp = {
  currentNav: 'overview',
  users: [],
  keys: [],
  sites: [],

  async init() {
    if (!Auth.requireAuth('admin')) return;

    this.bindEvents();
    await this.loadStats();
    await this.loadUsers();
    await this.loadKeys();
    await this.loadSites();
  },

  bindEvents() {
    document.getElementById('admin-logout-btn').addEventListener('click', () => Auth.logout());

    // Navigation switching
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const nav = btn.getAttribute('data-nav');
        if (nav) this.switchNav(nav);
      });
    });

    // Form handlers
    document.getElementById('form-create-user').addEventListener('submit', (e) => this.handleCreateUser(e));
    document.getElementById('form-create-key').addEventListener('submit', (e) => this.handleCreateKey(e));
    document.getElementById('form-edit-user').addEventListener('submit', (e) => this.handleEditUser(e));
  },

  switchNav(navName) {
    this.currentNav = navName;

    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-nav') === navName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    document.querySelectorAll('.admin-pane').forEach(p => p.style.display = 'none');
    const target = document.getElementById(`admin-section-${navName}`);
    if (target) target.style.display = 'block';

    if (navName === 'overview') this.loadStats();
    if (navName === 'users') this.loadUsers();
    if (navName === 'keys') this.loadKeys();
    if (navName === 'sites') this.loadSites();
    if (navName === 'logs') this.loadLogs();
  },

  /* ------------------------------------------------------------------------
     1. STATS & OVERVIEW
     ------------------------------------------------------------------------ */
  async loadStats() {
    try {
      const res = await Auth.api('/api/admin/stats');
      const st = res.stats || {};

      document.getElementById('stat-total-users').innerText = st.users?.total || 0;
      document.getElementById('stat-active-users').innerText = `${st.users?.active || 0} active accounts`;

      document.getElementById('stat-total-sites').innerText = st.sites?.total || 0;
      document.getElementById('stat-active-sites').innerText = `${st.sites?.active || 0} active plugins`;

      document.getElementById('stat-total-keys').innerText = st.keys?.total || 0;
      document.getElementById('stat-active-keys').innerText = `${st.keys?.active || 0} valid keys`;

      document.getElementById('stat-total-logs').innerText = st.total_logs || 0;

      // Update pills
      document.getElementById('badge-users-count').innerText = st.users?.total || 0;
      document.getElementById('badge-keys-count').innerText = st.keys?.total || 0;
      document.getElementById('badge-sites-count').innerText = st.sites?.total || 0;
    } catch (err) {
      console.error('Error loading admin stats:', err);
    }
  },

  /* ------------------------------------------------------------------------
     2. USER MANAGEMENT
     ------------------------------------------------------------------------ */
  async loadUsers() {
    const tbody = document.getElementById('admin-users-tbody');
    try {
      const res = await Auth.api('/api/admin/users');
      this.users = res.users || [];

      // Populate user select dropdown in Create Key modal
      const select = document.getElementById('key-user-select');
      select.innerHTML = '<option value="">-- Choose User --</option>' + 
        this.users.map(u => `<option value="${u.id}">${u.name} (${u.email})</option>`).join('');

      if (this.users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 30px; color: var(--text-muted);">No users found. Click Add New User to create one.</td></tr>';
        return;
      }

      tbody.innerHTML = this.users.map(u => `
        <tr>
          <td>#${u.id}</td>
          <td>
            <div><strong>${u.name}</strong></div>
            <div style="font-size: 11px; color: var(--text-muted);">${u.email}</div>
          </td>
          <td><strong>${u.sites_count || 0}</strong></td>
          <td>${u.max_sites} sites max</td>
          <td><span class="badge badge-info">${u.keys_count || 0} key(s)</span></td>
          <td>
            <span class="badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}">
              ${u.status}
            </span>
          </td>
          <td style="font-size: 11px; color: var(--text-muted);">${new Date(u.created_at).toLocaleDateString()}</td>
          <td style="font-size: 11px; color: var(--text-muted);">${u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm" onclick="AdminApp.openEditUserModal(${u.id})">Edit</button>
              <button class="btn btn-secondary btn-sm" style="color: var(--danger);" onclick="AdminApp.deleteUser(${u.id}, '${u.email}')">Delete</button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--danger); padding: 20px;">Failed to load users: ${err.message}</td></tr>`;
    }
  },

  async handleCreateUser(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-new-user');
    btn.disabled = true;
    btn.innerText = 'Creating...';

    const payload = {
      email: document.getElementById('new-user-email').value.trim(),
      password: document.getElementById('new-user-password').value,
      name: document.getElementById('new-user-name').value.trim(),
      max_sites: parseInt(document.getElementById('new-user-maxsites').value, 10),
      auto_generate_key: document.getElementById('new-user-auto-key').checked,
    };

    try {
      const res = await Auth.api('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      this.closeModals();
      document.getElementById('form-create-user').reset();

      if (res.license_key) {
        alert(`✅ User created successfully!\n\nEmail: ${payload.email}\nLicense Key: ${res.license_key}\n\nGive this key and email to your client to activate their WordPress plugin!`);
      } else {
        Auth.showToast('✅ User account created successfully!', 'success');
      }

      await this.loadStats();
      await this.loadUsers();
      await this.loadKeys();
    } catch (err) {
      Auth.showToast(`Error: ${err.message}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerText = 'Create User Account';
    }
  },

  openEditUserModal(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('edit-user-id').value = user.id;
    document.getElementById('edit-user-email').value = user.email;
    document.getElementById('edit-user-name').value = user.name;
    document.getElementById('edit-user-maxsites').value = user.max_sites;
    document.getElementById('edit-user-status').value = user.status;
    document.getElementById('edit-user-password').value = '';

    document.getElementById('modal-edit-user').style.display = 'flex';
  },

  async handleEditUser(e) {
    e.preventDefault();
    const userId = document.getElementById('edit-user-id').value;
    const payload = {
      name: document.getElementById('edit-user-name').value.trim(),
      max_sites: parseInt(document.getElementById('edit-user-maxsites').value, 10),
      status: document.getElementById('edit-user-status').value,
    };

    const newPass = document.getElementById('edit-user-password').value;
    if (newPass && newPass.trim().length >= 6) {
      payload.password = newPass.trim();
    }

    try {
      await Auth.api(`/api/admin/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      this.closeModals();
      Auth.showToast('User profile updated successfully!', 'success');
      await this.loadUsers();
    } catch (err) {
      Auth.showToast(`Error: ${err.message}`, 'danger');
    }
  },

  async deleteUser(userId, email) {
    if (!confirm(`Are you sure you want to delete user ${email}?\n\nThis will also remove all their license keys and connected websites.`)) return;

    try {
      await Auth.api(`/api/admin/users/${userId}`, { method: 'DELETE' });
      Auth.showToast('User deleted.', 'info');
      await this.loadStats();
      await this.loadUsers();
      await this.loadKeys();
      await this.loadSites();
    } catch (err) {
      Auth.showToast(`Delete failed: ${err.message}`, 'danger');
    }
  },

  /* ------------------------------------------------------------------------
     3. LICENSE KEYS
     ------------------------------------------------------------------------ */
  async loadKeys() {
    const tbody = document.getElementById('admin-keys-tbody');
    try {
      const res = await Auth.api('/api/admin/keys');
      this.keys = res.keys || [];

      if (this.keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">No license keys generated yet.</td></tr>';
        return;
      }

      tbody.innerHTML = this.keys.map(k => `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <code style="font-size: 12px; font-weight: 700; color: var(--primary);">${k.license_key}</code>
              <button class="btn btn-secondary btn-sm" style="padding: 1px 5px; font-size: 11px;" onclick="AdminApp.copyString('${k.license_key}')">Copy</button>
            </div>
          </td>
          <td>
            <div><strong>${k.user_name || 'Client'}</strong></div>
            <div style="font-size: 11px; color: var(--text-muted);">${k.user_email}</div>
          </td>
          <td>
            <strong>${k.current_activations}</strong> / ${k.max_activations} sites
          </td>
          <td>
            <span class="badge ${k.status === 'active' ? 'badge-success' : 'badge-danger'}">
              ${k.status}
            </span>
          </td>
          <td style="font-size: 11px; color: var(--text-muted);">${new Date(k.created_at).toLocaleDateString()}</td>
          <td style="font-size: 12px; color: var(--text-muted);">${k.notes || '-'}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm" onclick="AdminApp.toggleKeyStatus(${k.id}, '${k.status === 'active' ? 'suspended' : 'active'}')">
                ${k.status === 'active' ? 'Suspend' : 'Activate'}
              </button>
              <button class="btn btn-secondary btn-sm" style="color: var(--danger);" onclick="AdminApp.deleteKey(${k.id})">Revoke</button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger); padding: 20px;">Failed to load keys: ${err.message}</td></tr>`;
    }
  },

  async handleCreateKey(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-new-key');
    btn.disabled = true;

    const payload = {
      user_id: parseInt(document.getElementById('key-user-select').value, 10),
      max_activations: parseInt(document.getElementById('key-max-activations').value, 10),
      notes: document.getElementById('key-notes').value.trim(),
    };

    try {
      const res = await Auth.api('/api/admin/keys', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      this.closeModals();
      document.getElementById('form-create-key').reset();

      alert(`✅ New License Key Generated!\n\nKey: ${res.license_key}\n\nCopied to clipboard!`);
      this.copyString(res.license_key);

      await this.loadStats();
      await this.loadKeys();
    } catch (err) {
      Auth.showToast(`Error: ${err.message}`, 'danger');
    } finally {
      btn.disabled = false;
    }
  },

  async toggleKeyStatus(keyId, newStatus) {
    try {
      await Auth.api(`/api/admin/keys/${keyId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      Auth.showToast(`Key status updated to ${newStatus}`, 'info');
      await this.loadKeys();
    } catch (err) {
      Auth.showToast(`Failed: ${err.message}`, 'danger');
    }
  },

  async deleteKey(keyId) {
    if (!confirm('Are you sure you want to revoke and delete this license key?')) return;
    try {
      await Auth.api(`/api/admin/keys/${keyId}`, { method: 'DELETE' });
      Auth.showToast('License key revoked.', 'info');
      await this.loadStats();
      await this.loadKeys();
    } catch (err) {
      Auth.showToast(`Failed: ${err.message}`, 'danger');
    }
  },

  /* ------------------------------------------------------------------------
     4. ALL CONNECTED WEBSITES
     ------------------------------------------------------------------------ */
  async loadSites() {
    const tbody = document.getElementById('admin-sites-tbody');
    try {
      const res = await Auth.api('/api/sites');
      this.sites = res.sites || [];

      if (this.sites.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">No websites connected yet.</td></tr>';
        return;
      }

      tbody.innerHTML = this.sites.map(s => `
        <tr>
          <td>
            <div><strong>${s.domain}</strong></div>
            <div style="font-size: 11px;"><a href="${s.site_url}" target="_blank" rel="noopener">${s.site_url} ↗</a></div>
          </td>
          <td>
            <div><strong>${s.user_name || 'Client'}</strong></div>
            <div style="font-size: 11px; color: var(--text-muted);">${s.user_email || ''}</div>
          </td>
          <td><code style="font-size: 11px; color: var(--primary);">${s.license_key || 'Direct'}</code></td>
          <td><span class="badge badge-info">${s.plugin_version || 'v8.9+'}</span></td>
          <td style="font-size: 11px;">WP: ${s.wp_version || '-'} • WC: ${s.wc_version || '-'}</td>
          <td>
            <span class="badge ${s.status === 'active' ? 'badge-success' : 'badge-warning'}">
              ${s.status}
            </span>
          </td>
          <td style="font-size: 11px; color: var(--text-muted);">${s.last_sync ? new Date(s.last_sync).toLocaleString() : 'Never'}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-secondary btn-sm" onclick="AdminApp.pingSite(${s.id})">Ping</button>
              <button class="btn btn-secondary btn-sm" style="color: var(--danger);" onclick="AdminApp.deleteSite(${s.id}, '${s.domain}')">Disconnect</button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger); padding: 20px;">Failed to load sites: ${err.message}</td></tr>`;
    }
  },

  async pingSite(siteId) {
    try {
      const res = await Auth.api(`/api/sites/${siteId}/ping`, { method: 'POST' });
      if (res.online) {
        Auth.showToast('✅ Site ping successful and active!', 'success');
      } else {
        Auth.showToast(`⚠️ Site returned unreachable: ${res.error}`, 'warning');
      }
      await this.loadSites();
    } catch (err) {
      Auth.showToast(`Ping error: ${err.message}`, 'danger');
    }
  },

  async deleteSite(siteId, domain) {
    if (!confirm(`Are you sure you want to forcibly disconnect ${domain}?`)) return;
    try {
      await Auth.api(`/api/sites/${siteId}`, { method: 'DELETE' });
      Auth.showToast(`Site ${domain} disconnected.`, 'info');
      await this.loadStats();
      await this.loadSites();
    } catch (err) {
      Auth.showToast(`Failed: ${err.message}`, 'danger');
    }
  },

  /* ------------------------------------------------------------------------
     5. AUDIT LOGS
     ------------------------------------------------------------------------ */
  async loadLogs() {
    const tbody = document.getElementById('admin-logs-tbody');
    const search = document.getElementById('log-search-input').value.trim();

    try {
      const url = `/api/admin/logs?limit=50${search ? '&action=' + encodeURIComponent(search) : ''}`;
      const res = await Auth.api(url);
      const logs = res.logs || [];

      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 30px; color: var(--text-muted);">No logs found.</td></tr>';
        return;
      }

      tbody.innerHTML = logs.map(l => {
        let badgeClass = 'badge-muted';
        if (l.action.includes('login')) badgeClass = 'badge-info';
        if (l.action.includes('activated') || l.action.includes('create')) badgeClass = 'badge-success';
        if (l.action.includes('fail') || l.action.includes('blocked') || l.action.includes('delete') || l.action.includes('disconnected')) badgeClass = 'badge-danger';

        const detailStr = l.details ? JSON.stringify(l.details) : '-';

        return `
          <tr>
            <td style="font-size: 11px; color: var(--text-muted); white-space: nowrap;">
              ${new Date(l.created_at).toLocaleString()}
            </td>
            <td>
              <span class="badge ${l.actor_type === 'admin' ? 'badge-info' : 'badge-muted'}">${l.actor_type}</span>
              <span style="font-size: 11px; margin-left: 4px;">${l.actor_email || '-'}</span>
            </td>
            <td><span class="badge ${badgeClass}">${l.action}</span></td>
            <td style="font-size: 11px; font-family: monospace; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${detailStr}">
              ${detailStr}
            </td>
            <td style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${l.ip_address || '-'}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger); padding: 20px;">Failed to load logs: ${err.message}</td></tr>`;
    }
  },

  /* ------------------------------------------------------------------------
     MODALS & UTILS
     ------------------------------------------------------------------------ */
  openNewUserModal() {
    document.getElementById('modal-create-user').style.display = 'flex';
  },

  openNewKeyModal() {
    document.getElementById('modal-create-key').style.display = 'flex';
  },

  closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
  },

  copyString(str) {
    navigator.clipboard.writeText(str);
    Auth.showToast('Copied to clipboard!', 'info');
  },
};

// Initialize Admin App
document.addEventListener('DOMContentLoaded', () => {
  AdminApp.init();
});
