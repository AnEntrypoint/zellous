import { generateSecretKey, getPublicKey, finalizeEvent, SimplePool, nip19 } from 'https://esm.sh/nostr-tools@2';

const RELAYS = ['wss://relay.damus.io', 'wss://relay.nostr.band', 'wss://nos.lol'];

class NostrAdapter {
  constructor() {
    this._listeners = {};
    this._pool = null;
    this._sub = null;
    this._roomId = null;
    this._channelId = null;
    this._privkey = null;
    this._pubkey = null;
    this._seenIds = new Set();
    this.auth = {
      login: (opts = {}) => this._login(opts),
      logout: () => this._logout(),
      getUser: () => Promise.resolve(this._pubkey ? { id: this._pubkey, username: this._displayName() } : null)
    };
    this.messaging = {
      send: (content) => this._publishMessage(content),
      sendImage: (file, caption = '') => this._publishImage(file, caption)
    };
    this.audio = {
      startPTT: () => Promise.resolve(),
      stopPTT: () => {}
    };
    this.files = {
      upload: () => Promise.resolve(),
      list: () => {}
    };
  }

  connect(roomId) {
    this._roomId = roomId;
    this._channelId = this._deriveChannelId(roomId);
    this._pool = new SimplePool();
    this._subscribe();
    this._emit('connected', {});
    return this;
  }

  disconnect() {
    if (this._sub) { this._sub.close(); this._sub = null; }
    if (this._pool) { this._pool.close(RELAYS); this._pool = null; }
  }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  off(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  }

  send(type, data = {}) {
    if (type === 'text_message') this._publishMessage(data.content || '');
  }

  async _login(opts = {}) {
    if (opts.nsec) {
      try {
        const decoded = nip19.decode(opts.nsec);
        this._privkey = decoded.data;
        this._pubkey = getPublicKey(this._privkey);
        this._persistKey();
        return { user: { id: this._pubkey, username: this._displayName() } };
      } catch {
        return { error: 'Invalid nsec key' };
      }
    }
    if (opts.generate) {
      this._privkey = generateSecretKey();
      this._pubkey = getPublicKey(this._privkey);
      this._persistKey();
      return { user: { id: this._pubkey, username: this._displayName() }, generated: true };
    }
    if (window.nostr) {
      try {
        this._pubkey = await window.nostr.getPublicKey();
        this._privkey = null;
        localStorage.setItem('nostr_pubkey', this._pubkey);
        return { user: { id: this._pubkey, username: this._displayName() } };
      } catch {
        return { error: 'NIP-07 extension denied access' };
      }
    }
    const stored = localStorage.getItem('nostr_privkey');
    if (stored) {
      this._privkey = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
      this._pubkey = getPublicKey(this._privkey);
      return { user: { id: this._pubkey, username: this._displayName() } };
    }
    this._privkey = generateSecretKey();
    this._pubkey = getPublicKey(this._privkey);
    this._persistKey();
    return { user: { id: this._pubkey, username: this._displayName() }, generated: true };
  }

  _logout() {
    this._privkey = null;
    this._pubkey = null;
    localStorage.removeItem('nostr_privkey');
    localStorage.removeItem('nostr_pubkey');
  }

  _persistKey() {
    if (this._privkey) {
      localStorage.setItem('nostr_privkey', btoa(String.fromCharCode(...this._privkey)));
    }
    if (this._pubkey) localStorage.setItem('nostr_pubkey', this._pubkey);
  }

  _displayName() {
    if (!this._pubkey) return 'Anonymous';
    return this._pubkey.slice(0, 8) + '...' + this._pubkey.slice(-4);
  }

  _deriveChannelId(roomId) {
    let hash = 0;
    for (let i = 0; i < roomId.length; i++) hash = (hash * 31 + roomId.charCodeAt(i)) >>> 0;
    return hash.toString(16).padStart(8, '0') + '-nostr-' + roomId;
  }

  _subscribe() {
    if (!this._pool || !this._channelId) return;
    const since = Math.floor(Date.now() / 1000) - 86400;
    this._sub = this._pool.subscribeMany(RELAYS, [
      { kinds: [42], '#e': [this._channelId], since },
      { kinds: [40, 41], '#d': [this._channelId] }
    ], {
      onevent: (event) => this._handleEvent(event),
      oneose: () => {}
    });
  }

  _handleEvent(event) {
    if (this._seenIds.has(event.id)) return;
    this._seenIds.add(event.id);
    if (event.kind === 42) {
      this._emit('text_message', {
        id: event.id,
        userId: event.pubkey,
        username: event.pubkey.slice(0, 8) + '...',
        content: event.content,
        timestamp: event.created_at * 1000
      });
    }
  }

  async _publishMessage(content) {
    if (!this._pubkey || !content) return;
    const template = {
      kind: 42,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['e', this._channelId, RELAYS[0], 'root']],
      content
    };
    const event = await this._signEvent(template);
    if (!event) return;
    this._pool.publish(RELAYS, event);
  }

  async _publishImage(file, caption) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = caption ? `${caption}\n${e.target.result}` : e.target.result;
        await this._publishMessage(content);
        resolve();
      };
      reader.readAsDataURL(file);
    });
  }

  async _signEvent(template) {
    if (window.nostr && !this._privkey) {
      try { return await window.nostr.signEvent(template); } catch { return null; }
    }
    if (this._privkey) return finalizeEvent(template, this._privkey);
    return null;
  }

  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => { try { fn(data); } catch {} });
    (this._listeners['*'] || []).forEach(fn => { try { fn(data); } catch {} });
  }
}

const instance = new NostrAdapter();
if (typeof window !== 'undefined') window.ZellousSDK = instance;
export default instance;
