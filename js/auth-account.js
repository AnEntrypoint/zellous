Object.assign(auth, {

  async getSessions() {
    if (!this.session) return [];
    try {
      const res = await fetch('/api/sessions', {
        headers: { 'Authorization': `Bearer ${this.session.id}` }
      });
      const data = await res.json();
      return data.sessions || [];
    } catch(e) { console.error("[auth] fetch error:", e); return []; }
  },

  async getDevices() {
    if (!this.session) return [];
    try {
      const res = await fetch('/api/devices', {
        headers: { 'Authorization': `Bearer ${this.session.id}` }
      });
      const data = await res.json();
      this.devices = data.devices || [];
      return this.devices;
    } catch(e) { console.error("[auth] fetch error:", e); return []; }
  },

  async removeDevice(deviceId) {
    if (!this.session) return false;
    try {
      await fetch(`/api/devices/${deviceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.session.id}` }
      });
      this.devices = this.devices.filter(d => d.id !== deviceId);
      return true;
    } catch(e) { console.error("[auth] request error:", e); return false; }
  },

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
    } catch(e) { console.error("[auth] request error:", e); return false; }
  },

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
    } catch(e) { console.error("[auth] request error:", e); return false; }
  },

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
    this.clear();
    return data;
  },

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
});
