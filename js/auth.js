// Authentication module - login persistence and multi-device support

const auth = {
  user: null,
  session: null,
  devices: [],

  // Initialize from localStorage
  init() {
    const stored = localStorage.getItem('zellous_session');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        this.session = data.session;
        this.user = data.user;
      } catch {}
    }
  },

  // Save session to localStorage
  save() {
    if (this.session && this.user) {
      localStorage.setItem('zellous_session', JSON.stringify({
        session: this.session,
        user: this.user
      }));
    }
  },

  // Clear session
  clear() {
    this.user = null;
    this.session = null;
    localStorage.removeItem('zellous_session');
  },

  // Get auth token for WebSocket
  getToken() {
    return this.session?.id || null;
  },

  // Check if logged in
  isLoggedIn() {
    return !!this.session && !!this.user;
  },

  // Register new account
  async register(username, password, displayName = null) {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      return data;
    } catch (e) {
      throw e;
    }
  },

  // Login
  async login(username, password) {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          deviceName: this.getDeviceName(),
          userAgent: navigator.userAgent
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      this.user = data.user;
      this.session = data.session;
      this.save();

      // Reconnect WebSocket with auth
      if (window.network) {
        network.reconnect();
      }

      return data;
    } catch (e) {
      throw e;
    }
  },

  // Logout
  async logout() {
    try {
      if (this.session) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.session.id}`
          }
        });
      }
    } finally {
      this.clear();
      if (window.network) {
        network.reconnect();
      }
    }
  },

  // Logout from all devices
  async logoutAll() {
    try {
      if (this.session) {
        await fetch('/api/auth/logout-all', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.session.id}`
          }
        });
      }
    } finally {
      this.clear();
      if (window.network) {
        network.reconnect();
      }
    }
  },

  // Get active sessions
  async getSessions() {
    if (!this.session) return [];
    try {
      const res = await fetch('/api/sessions', {
        headers: { 'Authorization': `Bearer ${this.session.id}` }
      });
      const data = await res.json();
      return data.sessions || [];
    } catch {
      return [];
    }
  },

  // Get devices
  async getDevices() {
    if (!this.session) return [];
    try {
      const res = await fetch('/api/devices', {
        headers: { 'Authorization': `Bearer ${this.session.id}` }
      });
      const data = await res.json();
      this.devices = data.devices || [];
      return this.devices;
    } catch {
      return [];
    }
  },

  // Remove device
  async removeDevice(deviceId) {
    if (!this.session) return false;
    try {
      await fetch(`/api/devices/${deviceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.session.id}` }
      });
      this.devices = this.devices.filter(d => d.id !== deviceId);
      return true;
    } catch {
      return false;
    }
  },

  // Update display name
  async updateDisplayName(displayName) {
    if (!this.session) return false;
    try {
      const res = await fetch('/api/user', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.session.id}`
        },
        body: JSON.stringify({ displayName })
      });
      if (res.ok) {
        this.user.displayName = displayName;
        this.save();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  // Update settings
  async updateSettings(settings) {
    if (!this.session) return false;
    try {
      const res = await fetch('/api/user', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.session.id}`
        },
        body: JSON.stringify({ settings })
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  // Change password
  async changePassword(currentPassword, newPassword) {
    if (!this.session) throw new Error('Not logged in');
    const res = await fetch('/api/user/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.session.id}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to change password');
    // Clear session after password change
    this.clear();
    return data;
  },

  // Get device name
  getDeviceName() {
    const ua = navigator.userAgent;
    if (ua.includes('iPhone')) return 'iPhone';
    if (ua.includes('iPad')) return 'iPad';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('Mac')) return 'Mac';
    if (ua.includes('Windows')) return 'Windows PC';
    if (ua.includes('Linux')) return 'Linux';
    return 'Unknown Device';
  }
};

// Initialize auth on load
auth.init();

window.auth = auth;
