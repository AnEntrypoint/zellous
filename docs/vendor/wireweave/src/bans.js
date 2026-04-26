export class Bans extends EventTarget {
  constructor({ relayPool, auth = null, roles = null }) {
    super();
    if (!relayPool) throw new Error('Bans: relayPool required');
    this.pool = relayPool; this.auth = auth; this.roles = roles;
    this.store = new Map();
    this.sub = null;
  }

  isBanned(serverId, pubkey) { return !!(this.store.get(serverId)?.banned || []).includes(pubkey); }

  isTimedOut(serverId, pubkey) {
    const t = this.store.get(serverId)?.timeouts?.[pubkey];
    return !!t && t.expiry > Math.floor(Date.now() / 1000);
  }

  async ban(serverId, pubkey) {
    if (!this.auth?.isLoggedIn()) throw new Error('Not logged in');
    if (this.roles && !this.roles.isAdmin(serverId)) throw new Error('Insufficient permissions');
    const dTag = 'zellous-ban:' + serverId + ':' + pubkey;
    const signed = await this.auth.sign({
      kind: 30078, created_at: Math.floor(Date.now() / 1000),
      tags: [['d', dTag], ['server', serverId]],
      content: JSON.stringify({ action: 'ban', pubkey, timestamp: Math.floor(Date.now() / 1000) })
    });
    this.pool.publish(signed);
  }

  async timeout(serverId, pubkey, minutes) {
    if (!this.auth?.isLoggedIn()) throw new Error('Not logged in');
    if (this.roles && !this.roles.isAdmin(serverId)) throw new Error('Insufficient permissions');
    const expiry = Math.floor(Date.now() / 1000) + (minutes * 60);
    const dTag = 'zellous-timeout:' + serverId + ':' + pubkey;
    const signed = await this.auth.sign({
      kind: 30078, created_at: Math.floor(Date.now() / 1000),
      tags: [['d', dTag], ['server', serverId]],
      content: JSON.stringify({ action: 'timeout', pubkey, expiry })
    });
    this.pool.publish(signed);
  }

  async kickFromVoice(pubkey) {
    if (!this.auth?.isLoggedIn()) throw new Error('Not logged in');
    const signed = await this.auth.sign({
      kind: 30078, created_at: Math.floor(Date.now() / 1000),
      tags: [['d', 'zellous-kick:' + pubkey]], content: ''
    });
    this.pool.publish(signed);
  }

  subscribe(serverId) {
    if (this.sub) { this.pool.unsubscribe(this.sub); this.sub = null; }
    if (!serverId) return;
    const creator = serverId.split(':')[0];
    if (!creator) return;
    this.sub = 'bans-' + serverId;
    this.pool.subscribe(this.sub,
      [{ kinds: [30078], authors: [creator], '#d': ['zellous-ban:' + serverId, 'zellous-timeout:' + serverId] }],
      (event) => {
        if (event.pubkey !== creator) return;
        try {
          const dTag = event.tags.find(t => t[0] === 'd');
          if (!dTag?.[1]) return;
          const [prefix, , pubkey] = dTag[1].split(':');
          const data = this.store.get(serverId) || { banned: [], timeouts: {} };
          if (prefix === 'zellous-ban' && pubkey && !data.banned.includes(pubkey)) data.banned.push(pubkey);
          else if (prefix === 'zellous-timeout' && pubkey) {
            const parsed = JSON.parse(event.content);
            if (parsed.expiry > Math.floor(Date.now() / 1000)) (data.timeouts = data.timeouts || {})[pubkey] = { expiry: parsed.expiry };
            else if (data.timeouts?.[pubkey]) delete data.timeouts[pubkey];
          }
          this.store.set(serverId, data);
          this.dispatchEvent(new CustomEvent('updated', { detail: { serverId, data } }));
        } catch {}
      });
  }
}

export const createBans = (opts) => new Bans(opts);
