const DEFAULT_CATEGORIES = [
  { id: 'general', name: 'TEXT CHANNELS', position: 0 },
  { id: 'voice', name: 'VOICE CHANNELS', position: 1 }
];

const DEFAULT_CHANNELS = [
  { id: 'general', name: 'general', type: 'text', categoryId: 'general', position: 0 },
  { id: 'announcements', name: 'announcements', type: 'announcement', categoryId: 'general', position: 1 },
  { id: 'general-voice', name: 'General', type: 'voice', categoryId: 'voice', position: 0 }
];

export class Channels extends EventTarget {
  constructor({ relayPool, auth }) {
    super();
    if (!relayPool || !auth) throw new Error('Channels: relayPool + auth required');
    this.pool = relayPool; this.auth = auth;
    this.serverId = ''; this.channels = []; this.categories = [];
  }

  isOwner() { return this.auth.pubkey && this.serverId && this.auth.pubkey === this.serverId.split(':')[0]; }

  load(serverId, onReady) {
    this.serverId = serverId;
    this.channels = []; this.categories = [];
    const ownerPubkey = serverId.split(':')[0];
    const dTag = 'zellous-channels:' + serverId;
    this.pool.subscribe('channels-' + serverId,
      [{ kinds: [30078], authors: [ownerPubkey], '#d': [dTag] }],
      (event) => {
        const hasTag = event.tags?.some(t => t[0] === 'd' && t[1] === dTag);
        if (!hasTag) return;
        try {
          const data = JSON.parse(event.content);
          this.channels = data.channels || [];
          this.categories = data.categories || [];
          this._emit('updated', { channels: this.channels, categories: this.categories });
        } catch {}
      },
      () => {
        if (!this.channels.length) this._setDefaults();
        onReady?.();
      });
  }

  _setDefaults() {
    this.channels = DEFAULT_CHANNELS.map(c => ({ ...c }));
    this.categories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
    this._emit('updated', { channels: this.channels, categories: this.categories });
    if (this.isOwner()) this._publish().catch(() => {});
  }

  async _publish() {
    if (!this.isOwner()) return;
    const signed = await this.auth.sign({
      kind: 30078, created_at: Math.floor(Date.now() / 1000),
      tags: [['d', 'zellous-channels:' + this.serverId]],
      content: JSON.stringify({ channels: this.channels, categories: this.categories })
    });
    this.pool.publish(signed);
  }

  async create(name, type = 'text', categoryId = 'general') {
    this.channels = [...this.channels, { id: 'ch-' + Date.now(), name, type, categoryId, position: this.channels.length }];
    await this._publish();
    this._emit('updated', { channels: this.channels, categories: this.categories });
  }

  async rename(id, name) {
    this.channels = this.channels.map(c => c.id === id ? { ...c, name } : c);
    await this._publish(); this._emit('updated', { channels: this.channels, categories: this.categories });
  }

  async remove(id) {
    this.channels = this.channels.filter(c => c.id !== id);
    await this._publish(); this._emit('updated', { channels: this.channels, categories: this.categories });
  }

  async createCategory(name) {
    this.categories = [...this.categories, { id: 'cat-' + Date.now(), name, position: this.categories.length }];
    await this._publish(); this._emit('updated', { channels: this.channels, categories: this.categories });
  }

  async renameCategory(id, name) {
    this.categories = this.categories.map(c => c.id === id ? { ...c, name } : c);
    await this._publish(); this._emit('updated', { channels: this.channels, categories: this.categories });
  }

  async deleteCategory(id) {
    this.categories = this.categories.filter(c => c.id !== id);
    this.channels = this.channels.map(c => c.categoryId === id ? { ...c, categoryId: null } : c);
    await this._publish(); this._emit('updated', { channels: this.channels, categories: this.categories });
  }

  async reorder(catId, ids) {
    ids.forEach((chId, idx) => { this.channels = this.channels.map(c => c.id === chId ? { ...c, position: idx, categoryId: catId } : c); });
    await this._publish(); this._emit('updated', { channels: this.channels, categories: this.categories });
  }

  async reorderCategories(ids) {
    ids.forEach((catId, idx) => { this.categories = this.categories.map(c => c.id === catId ? { ...c, position: idx } : c); });
    await this._publish(); this._emit('updated', { channels: this.channels, categories: this.categories });
  }

  _emit(t, d) { this.dispatchEvent(new CustomEvent(t, { detail: d })); }
}

export const createChannels = (opts) => new Channels(opts);
