export class Roles extends EventTarget {
  constructor({ relayPool, auth }) {
    super();
    if (!relayPool || !auth) throw new Error('Roles: deps required');
    this.pool = relayPool; this.auth = auth;
    this.store = new Map();
    this.sub = null;
  }

  _creatorOf(serverId) { return serverId ? serverId.split(':')[0] : null; }

  isOwner(serverId) { return !!this.auth.pubkey && this._creatorOf(serverId) === this.auth.pubkey; }
  isAdmin(serverId) { if (this.isOwner(serverId)) return true; const r = this.store.get(serverId); return !!(r?.admins || []).includes(this.auth.pubkey); }
  isMod(serverId) { if (this.isAdmin(serverId)) return true; const r = this.store.get(serverId); return !!(r?.mods || []).includes(this.auth.pubkey); }

  getRole(serverId, pubkey) {
    if (pubkey === this._creatorOf(serverId)) return 'owner';
    const r = this.store.get(serverId) || {};
    if ((r.admins || []).includes(pubkey)) return 'admin';
    if ((r.mods || []).includes(pubkey)) return 'moderator';
    return 'member';
  }

  async setRole(serverId, targetPubkey, role) {
    if (!this.isOwner(serverId) && role === 'admin') throw new Error('Only owner can assign admin');
    if (!this.isAdmin(serverId)) throw new Error('Insufficient permissions');
    const existing = this.store.get(serverId) || { admins: [], mods: [] };
    let admins = (existing.admins || []).filter(p => p !== targetPubkey);
    let mods = (existing.mods || []).filter(p => p !== targetPubkey);
    if (role === 'admin') admins = [...admins, targetPubkey];
    else if (role === 'moderator') mods = [...mods, targetPubkey];
    const next = { admins, mods };
    this.store.set(serverId, next);
    const signed = await this.auth.sign({ kind: 30078, created_at: Math.floor(Date.now() / 1000), tags: [['d', 'zellous-roles:' + serverId]], content: JSON.stringify(next) });
    this.pool.publish(signed);
    this.dispatchEvent(new CustomEvent('updated', { detail: { serverId, next } }));
  }

  subscribe(serverId) {
    if (this.sub) { this.pool.unsubscribe(this.sub); this.sub = null; }
    if (!serverId) return;
    const creator = this._creatorOf(serverId);
    if (!creator) return;
    this.sub = 'roles-' + serverId;
    this.pool.subscribe(this.sub,
      [{ kinds: [30078], authors: [creator], '#d': ['zellous-roles:' + serverId] }],
      (event) => {
        if (event.pubkey !== creator) return;
        try {
          const data = JSON.parse(event.content);
          this.store.set(serverId, { admins: data.admins || [], mods: data.mods || [] });
          this.dispatchEvent(new CustomEvent('updated', { detail: { serverId, next: this.store.get(serverId) } }));
        } catch {}
      });
  }
}

export const createRoles = (opts) => new Roles(opts);
