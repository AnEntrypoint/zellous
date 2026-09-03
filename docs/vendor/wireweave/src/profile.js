// Portable nostr identity/profiles: kind:0 (NIP-01 "set_metadata") is the
// real nostr-native replaceable event carrying name/picture/about/nip05 —
// publishing it here means an identity (bare pubkey today) becomes portable
// across ANY wireweave-based app (spoint etc), not just the app that first
// created it, since any relay-connected nostr client already knows how to
// read kind:0. chat.js already has a read-only per-Chat-instance
// _fetchProfile/resolveProfile cache for showing names in a chat UI; this
// module is the write path (publish your own profile) plus a
// relay-pool-agnostic fetch-by-pubkey a non-Chat caller can use, and real
// NIP-05 (`name@domain`) identifier verification via the domain's
// `/.well-known/nostr.json` per the NIP-05 spec.

const KIND_METADATA = 0;
const PROFILE_CACHE_TTL_MS = 300000;

export class Profile extends EventTarget {
  constructor({ relayPool, auth, fetchImpl = null }) {
    super();
    if (!relayPool || !auth) throw new Error('Profile: relayPool + auth required');
    this.pool = relayPool;
    this.auth = auth;
    this.fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    this.cache = new Map(); // pubkey -> { profile, fetchedAt, eventCreatedAt }
    this.subs = new Map();
  }

  // Publishes (or replaces — kind:0 is a NIP-01 replaceable event, the relay
  // keeps only the newest per-pubkey copy) your own profile metadata.
  // `fields` is shallow-merged onto whatever's already cached for yourself
  // so a caller can update just one field (e.g. only `picture`) without
  // clobbering the rest.
  async publish(fields) {
    if (!this.auth.isLoggedIn()) throw new Error('Profile: not logged in');
    const existing = this.cache.get(this.auth.pubkey)?.profile || {};
    const next = { ...existing, ...fields };
    const signed = await this.auth.sign({
      kind: KIND_METADATA,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(next)
    });
    this.pool.publish(signed);
    this.cache.set(this.auth.pubkey, { profile: next, fetchedAt: Date.now(), eventCreatedAt: signed.created_at });
    this._emit('updated', { pubkey: this.auth.pubkey, profile: next });
    return signed;
  }

  // One-shot fetch (resolves once, EOSE-driven, with a timeout) — for a
  // caller that just needs "the current profile for this pubkey" without
  // wanting a standing subscription. Serves from cache if fresh
  // (PROFILE_CACHE_TTL_MS) unless forceRefresh is set.
  async fetchOnce(pubkey, { timeoutMs = 8000, forceRefresh = false } = {}) {
    const cached = this.cache.get(pubkey);
    if (cached && !forceRefresh && Date.now() - cached.fetchedAt < PROFILE_CACHE_TTL_MS) return cached.profile;
    return new Promise((resolve) => {
      const subId = 'profile-once-' + pubkey.slice(0, 16) + '-' + Math.random().toString(36).slice(2, 8);
      let settled = false;
      const timer = setTimeout(() => { if (!settled) { settled = true; this.pool.unsubscribe(subId); resolve(cached?.profile ?? null); } }, timeoutMs);
      let best = null;
      this.pool.subscribe(subId,
        [{ kinds: [KIND_METADATA], authors: [pubkey] }],
        (event) => {
          if (best && best.created_at >= event.created_at) return;
          try { best = { created_at: event.created_at, profile: JSON.parse(event.content) }; } catch {}
        },
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.pool.unsubscribe(subId);
          if (best) {
            this.cache.set(pubkey, { profile: best.profile, fetchedAt: Date.now(), eventCreatedAt: best.created_at });
            this._emit('updated', { pubkey, profile: best.profile });
          }
          resolve(best?.profile ?? cached?.profile ?? null);
        });
    });
  }

  // Standing subscription — calls onUpdate(profile) every time a newer
  // kind:0 for this pubkey arrives (profile changed live), same
  // newest-wins dedupe chat.js's _fetchProfile already uses.
  subscribe(pubkey, onUpdate) {
    if (this.subs.has(pubkey)) return this.subs.get(pubkey);
    const subId = 'profile-sub-' + pubkey.slice(0, 16);
    this.subs.set(pubkey, subId);
    this.pool.subscribe(subId,
      [{ kinds: [KIND_METADATA], authors: [pubkey] }],
      (event) => {
        const cached = this.cache.get(pubkey);
        if (cached && cached.eventCreatedAt >= event.created_at) return;
        let profile;
        try { profile = JSON.parse(event.content); } catch { return; }
        this.cache.set(pubkey, { profile, fetchedAt: Date.now(), eventCreatedAt: event.created_at });
        this._emit('updated', { pubkey, profile });
        onUpdate?.(profile);
      });
    return subId;
  }

  unsubscribe(pubkey) {
    const subId = this.subs.get(pubkey);
    if (subId) { this.pool.unsubscribe(subId); this.subs.delete(pubkey); }
  }

  getCached(pubkey) { return this.cache.get(pubkey)?.profile ?? null; }

  // Real NIP-05 verification: fetches https://<domain>/.well-known/nostr.json
  // and checks that names[localpart] resolves to the expected pubkey — per
  // spec this is the ONLY trust anchor for a nip05 identifier claimed in a
  // profile (a profile can put any string in its nip05 field; verifying it
  // requires this real HTTP round-trip to the claimed domain, it is not
  // something derivable from the nostr event alone). Returns false (never
  // throws) on any network/parse/mismatch failure — an unverifiable nip05
  // is a real, expected outcome, not an error.
  async verifyNip05(identifier, expectedPubkey) {
    if (!this.fetch) return false;
    const match = /^(?:([\w.+-]+)@)?([\w.-]+)$/.exec((identifier || '').trim());
    if (!match) return false;
    const localpart = match[1] || '_';
    const domain = match[2];
    if (!domain) return false;
    try {
      const res = await this.fetch('https://' + domain + '/.well-known/nostr.json?name=' + encodeURIComponent(localpart));
      if (!res.ok) return false;
      const body = await res.json();
      const resolved = body?.names?.[localpart];
      return typeof resolved === 'string' && resolved === expectedPubkey;
    } catch { return false; }
  }

  _emit(t, d) { this.dispatchEvent(new CustomEvent(t, { detail: d })); }
}

export const createProfile = (opts) => new Profile(opts);
