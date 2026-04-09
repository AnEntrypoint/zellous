
const auth = {
  user: null,
  session: null,
  devices: [],

  init() {
    const stored = localStorage.getItem('zellous_session');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        this.session = data.session;
        this.user = data.user;
      } catch(e) { console.error("[auth] init error:", e); }
    }
  },

  save() {
    if (this.session && this.user) {
      localStorage.setItem('zellous_session', JSON.stringify({
        session: this.session,
        user: this.user
      }));
    }
  },

  clear() {
    this.user = null;
    this.session = null;
    localStorage.removeItem('zellous_session');
  },

  getToken() {
    return this.session?.id || null;
  },

  isLoggedIn() {
    return !!this.session && !!this.user;
  },

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

      if (window.network) {
        network.reconnect();
      }

      return data;
    } catch (e) {
      throw e;
    }
  },

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
};

window.auth = auth;
