/**
 * Shield Pro Portal - Client Authentication Helper
 */

const TOKEN_KEY = 'shield_portal_token';
const USER_KEY = 'shield_portal_user';

const Auth = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  getUser() {
    const raw = localStorage.getItem(USER_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  isAuthenticated() {
    return !!this.getToken();
  },

  isAdmin() {
    const user = this.getUser();
    return user && user.role === 'admin';
  },

  requireAuth(requiredRole = null) {
    if (!this.isAuthenticated()) {
      window.location.href = '/index.html';
      return false;
    }

    if (requiredRole && requiredRole === 'admin' && !this.isAdmin()) {
      window.location.href = '/user/dashboard.html';
      return false;
    }

    return true;
  },

  logout() {
    const token = this.getToken();
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }).catch(() => {});
    }
    this.clearSession();
    window.location.href = '/index.html';
  },

  async api(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...(options.headers || {}),
    };

    try {
      const res = await fetch(endpoint, {
        ...options,
        headers,
      });

      if (res.status === 401) {
        this.clearSession();
        window.location.href = '/index.html?session_expired=1';
        throw new Error('Session expired');
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.message || `HTTP error ${res.status}`);
      }
      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      throw err;
    }
  },

  showToast(message, type = 'info') {
    const old = document.querySelector('.toast-notice');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notice';
    if (type === 'danger') toast.style.background = '#ef4444';
    if (type === 'success') toast.style.background = '#10b981';

    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 4000);
  },
};
