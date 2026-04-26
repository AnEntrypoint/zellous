const hexChannelId = async (channelId, serverId) => {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode((serverId || 'default') + ':' + channelId));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
};

export class Chat extends EventTarget {
  constructor({ relayPool, auth, getChannelContext = () => ({ channelId: null, serverId: '' }), isAdmin = () => false }) {
    super();
    if (!relayPool || !auth) throw new Error('Chat: relayPool + auth required');
    this.pool = relayPool; this.auth = auth;
    this.getChannelContext = getChannelContext; this.isAdmin = isAdmin;
    this.activeChannelId = null;
    this.messages = [];
    this.profiles = new Map(); this.fetching = new Set();
  }

  async send(content, { announcement = false } = {}) {
    const { channelId, serverId } = this.getChannelContext();
    if (!this.auth.isLoggedIn() || !channelId) return;
    if (announcement && !this.isAdmin(serverId)) return;
    const trimmed = content.trim(); if (!trimmed) return;
    const chanHex = await hexChannelId(channelId, serverId);
    const tags = [['e', chanHex, '', 'root']];
    if (announcement) tags.push(['t', 'announcement']);
    const signed = await this.auth.sign({ kind: 42, created_at: Math.floor(Date.now() / 1000), tags, content: trimmed });
    this.pool.publish(signed);
    this._addMessage(this._eventToMsg(signed));
  }

  async loadHistory(channelId) {
    const { serverId } = this.getChannelContext();
    if (this.activeChannelId) {
      this.pool.unsubscribe('chat-' + this.activeChannelId);
      this.pool.unsubscribe('chat-live-' + this.activeChannelId);
    }
    this.activeChannelId = channelId;
    this.messages = [];
    this._emit('messages', { list: [] });
    const chanHex = await hexChannelId(channelId, serverId);
    const collected = [];
    this.pool.subscribe('chat-' + channelId,
      [{ kinds: [42], '#e': [chanHex], limit: 50 }],
      (ev) => collected.push(this._eventToMsg(ev)),
      () => {
        collected.sort((a, b) => a.timestamp - b.timestamp);
        this.messages = collected;
        this._emit('messages', { list: collected });
      });
    this.pool.subscribe('chat-live-' + channelId,
      [{ kinds: [42], '#e': [chanHex], since: Math.floor(Date.now() / 1000) }],
      (ev) => this._addMessage(this._eventToMsg(ev)));
  }

  async deleteMessage(id) {
    const signed = await this.auth.sign({ kind: 5, created_at: Math.floor(Date.now() / 1000), tags: [['e', id]], content: 'deleted' });
    this.pool.publish(signed);
    this.messages = this.messages.filter(m => m.id !== id);
    this._emit('messages', { list: this.messages });
  }

  _eventToMsg(event) {
    const tTags = (event.tags || []).filter(t => t[0] === 't').map(t => t[1]);
    this._fetchProfile(event.pubkey);
    return { id: event.id, type: 'text', userId: event.pubkey, content: event.content, timestamp: event.created_at * 1000, tags: tTags };
  }

  _addMessage(msg) {
    if (this.messages.find(m => m.id === msg.id)) return;
    this.messages = [...this.messages, msg];
    this._emit('message', { message: msg });
    this._emit('messages', { list: this.messages });
  }

  resolveProfile(pubkey) {
    const p = this.profiles.get(pubkey);
    if (p) return p.name || this.auth.npubShort(pubkey);
    this._fetchProfile(pubkey);
    return this.auth.npubShort(pubkey);
  }

  _fetchProfile(pubkey) {
    if (this.fetching.has(pubkey)) return;
    this.fetching.add(pubkey);
    this.pool.subscribe('profile-' + pubkey,
      [{ kinds: [0], authors: [pubkey], limit: 1 }],
      (event) => { try { this.profiles.set(pubkey, JSON.parse(event.content)); this._emit('profile', { pubkey, profile: this.profiles.get(pubkey) }); } catch {} },
      () => { this.pool.unsubscribe('profile-' + pubkey); this.fetching.delete(pubkey); });
  }

  updateProfile(pubkey, profile) { this.profiles.set(pubkey, profile); this._emit('profile', { pubkey, profile }); }

  _emit(t, d) { this.dispatchEvent(new CustomEvent(t, { detail: d })); }
}

export const createChat = (opts) => new Chat(opts);
