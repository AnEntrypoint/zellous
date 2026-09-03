// NIP-51 kind:10000 personal mute list -- each user's own private curation,
// independent of server-level admin bans (bans.js). No backend, no relay
// infra beyond an addressable replaceable event the user's own client
// publishes and reads back on every device they log into.
export class Mutes extends EventTarget {
  constructor({ relayPool, auth }) {
    super();
    if (!relayPool || !auth) throw new Error('Mutes: relayPool + auth required');
    this.pool = relayPool; this.auth = auth;
    this.muted = new Set();
    this._loaded = false;
    this._sub = null;
  }

  isMuted(pubkey) { return this.muted.has(pubkey); }
  list() { return Array.from(this.muted); }

  async mute(pubkey) {
    if (!this.auth.isLoggedIn()) throw new Error('Not logged in');
    if (this.muted.has(pubkey)) return;
    this.muted.add(pubkey);
    await this._publish();
    this._emit();
  }

  async unmute(pubkey) {
    if (!this.auth.isLoggedIn()) throw new Error('Not logged in');
    if (!this.muted.has(pubkey)) return;
    this.muted.delete(pubkey);
    await this._publish();
    this._emit();
  }

  async _publish() {
    const tags = Array.from(this.muted).map((pk) => ['p', pk]);
    const signed = await this.auth.sign({ kind: 10000, created_at: Math.floor(Date.now() / 1000), tags, content: '' });
    this.pool.publish(signed);
  }

  // Loads the user's own most-recent kind:10000 list (a replaceable event —
  // relays return only the latest per author+kind, but subscribe across
  // several regardless in case an older relay doesn't dedupe server-side).
  load() {
    if (this._loaded) return;
    if (!this.auth.pubkey) {
      // Not logged in yet (e.g. called at boot before storage-restored auth
      // resolves) -- retry once login actually happens instead of silently
      // never loading the mute list for the rest of the session.
      this.auth.addEventListener('login', () => this.load(), { once: true });
      return;
    }
    this._loaded = true;
    let latestTs = 0;
    this._sub = 'mutes-' + this.auth.pubkey;
    this.pool.subscribe(this._sub,
      [{ kinds: [10000], authors: [this.auth.pubkey] }],
      (event) => {
        if (event.created_at < latestTs) return;
        latestTs = event.created_at;
        this.muted = new Set((event.tags || []).filter((t) => t[0] === 'p').map((t) => t[1]));
        this._emit();
      });
  }

  _emit() { this.dispatchEvent(new CustomEvent('updated', { detail: { muted: this.list() } })); }
}

export const createMutes = (opts) => new Mutes(opts);
