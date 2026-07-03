const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.nostr.band',
  'wss://nostr.wine',
  'wss://relay.current.fyi',
  'wss://offchain.pub',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.0xchat.com'
];

const SEEN_MAX = 10000;
const PENDING_MAX = 500;
const PENDING_TTL_MS = 120000;
const CONNECT_TIMEOUT_MS = 10000;
const jitter = (ms) => Math.round(ms * (0.75 + Math.random() * 0.5));

const lruTouch = (map, key) => {
  if (map.has(key)) { map.delete(key); map.set(key, 1); return false; }
  map.set(key, 1);
  if (map.size > SEEN_MAX) { const first = map.keys().next().value; map.delete(first); }
  return true;
};

const fnv1a = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return h.toString(16).padStart(8, '0');
};

const safeSubId = (subId) => subId.length <= 64 ? subId : subId.slice(0, 55) + '-' + fnv1a(subId);

export class RelayPool extends EventTarget {
  constructor({ relays = DEFAULT_RELAYS, verifyEvent = null, WebSocketImpl = null } = {}) {
    super();
    this.urls = [...relays];
    this.relays = new Map();
    this.subs = new Map();
    this.pending = [];
    this._pendingIds = new Set();
    this.seen = new Map();
    this._reconnectTimers = new Map();
    this._acks = new Map();
    this._closed = false;
    this.verifyEvent = verifyEvent;
    this.WS = WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    if (!this.WS) throw new Error('No WebSocket implementation available');
  }

  connect() {
    this._closed = false;
    for (const url of this.urls) this._open(url);
  }

  disconnect() {
    this._closed = true;
    for (const [, t] of this._reconnectTimers) clearTimeout(t);
    this._reconnectTimers.clear();
    for (const [, rec] of this._acks) { clearTimeout(rec.timer); rec.resolve(false); }
    this._acks.clear();
    for (const [, r] of this.relays) {
      if (r._connectTimer) clearTimeout(r._connectTimer);
      if (r.ws) {
        r.ws.onclose = null; r.ws.onerror = null; r.ws.onopen = null; r.ws.onmessage = null;
        if (typeof r.ws.removeAllListeners === 'function') r.ws.removeAllListeners();
        if (typeof r.ws.on === 'function') r.ws.on('error', () => {});
        try { r.ws.close(); } catch {}
      }
    }
    this.relays.clear();
  }

  _open(url) {
    if (this._closed) return;
    this._reconnectTimers.delete(url);
    const existing = this.relays.get(url);
    if (existing?.ws && (existing.ws.readyState === 0 || existing.ws.readyState === 1)) return;
    const relay = existing || { ws: null, status: 'connecting', subIds: new Set(), latencyMs: null, failCount: 0, reconnectDelay: 1000, _reqSentAt: null, _openedAt: null };
    relay.status = 'connecting';
    relay.latencyMs = null;
    this.relays.set(url, relay);
    let ws;
    try { ws = new this.WS(url); }
    catch (e) { relay.status = 'error'; this._emit('relay-status', { url, status: 'error' }); return; }
    relay.ws = ws;
    const connectTimer = setTimeout(() => {
      if (relay.ws !== ws || relay.status !== 'connecting') return;
      try { ws.close(); } catch {}
    }, CONNECT_TIMEOUT_MS);
    relay._connectTimer = connectTimer;
    ws.onopen = () => {
      clearTimeout(connectTimer);
      relay.status = 'connected';
      relay._openedAt = Date.now();
      this._emit('relay-status', { url, status: 'connected' });
      for (const [subId, sub] of this.subs) {
        ws.send(JSON.stringify(['REQ', subId, ...sub.filters]));
        relay.subIds.add(subId);
        if (!relay._reqSentAt) relay._reqSentAt = Date.now();
      }
      this._drainPending(url, ws);
    };
    ws.onmessage = (e) => {
      if (relay._reqSentAt && relay.latencyMs === null) {
        relay.latencyMs = Date.now() - relay._reqSentAt;
        relay._reqSentAt = null;
      }
      try { this._handle(url, typeof e.data === 'string' ? e.data : e.data.toString()); } catch {}
    };
    ws.onerror = () => { clearTimeout(connectTimer); relay.status = 'error'; this._emit('relay-status', { url, status: 'error' }); };
    ws.onclose = () => {
      clearTimeout(connectTimer);
      relay.status = 'closed';
      this._emit('relay-status', { url, status: 'closed' });
      const sustained = relay._openedAt && Date.now() - relay._openedAt > 5000;
      if (sustained) { relay.failCount = 0; relay.reconnectDelay = 1000; }
      else { relay.failCount++; relay.reconnectDelay = Math.min(relay.reconnectDelay * 2, 30000); }
      relay._openedAt = null;
      if (this._closed) return;
      const t = setTimeout(() => this._open(url), jitter(relay.reconnectDelay));
      this._reconnectTimers.set(url, t);
    };
  }

  _handle(url, raw) {
    const msg = JSON.parse(raw);
    if (!Array.isArray(msg) || msg.length < 2) return;
    const [type, subId] = msg;
    if (type === 'EVENT') {
      const event = msg[2];
      if (!event?.id) return;
      if (event.created_at > Math.floor(Date.now() / 1000) + 300) return;
      if (this.seen.has(event.id)) return;
      if (this.verifyEvent) {
        try { if (!this.verifyEvent(event)) return; } catch { return; }
      }
      lruTouch(this.seen, event.id);
      const sub = this.subs.get(subId);
      sub?.onEvent?.(event);
      this._emit('event', { subId, event });
    } else if (type === 'EOSE') {
      this.subs.get(subId)?.onEose?.();
      this._emit('eose', { subId });
    } else if (type === 'NOTICE') {
      this._emit('notice', { url, message: msg[1] });
    } else if (type === 'OK') {
      const accepted = msg[2] === true;
      const id = msg[1], reason = msg[3] || '';
      if (accepted) this._emit('ok', { url, id });
      else this._emit('reject', { url, id, reason });
      this._settleAck(id, accepted, reason);
    }
  }

  subscribe(subId, filters, onEvent, onEose) {
    subId = safeSubId(subId);
    this.subs.set(subId, { filters, onEvent, onEose });
    for (const [, relay] of this.relays) {
      if (relay.ws?.readyState === 1) {
        relay.ws.send(JSON.stringify(['REQ', subId, ...filters]));
        relay.subIds.add(subId);
        if (!relay._reqSentAt) relay._reqSentAt = Date.now();
      }
    }
    return subId;
  }

  unsubscribe(subId) {
    subId = safeSubId(subId);
    for (const [, relay] of this.relays) {
      if (relay.ws?.readyState === 1 && relay.subIds.has(subId)) {
        relay.ws.send(JSON.stringify(['CLOSE', subId]));
        relay.subIds.delete(subId);
      }
    }
    this.subs.delete(subId);
  }

  publish(event) {
    let sent = false;
    let anyDisconnected = false;
    const sentTo = new Set();
    for (const [url, relay] of this.relays) {
      if (relay.ws?.readyState === 1) {
        relay.ws.send(JSON.stringify(['EVENT', event]));
        sent = true;
        sentTo.add(url);
      } else {
        anyDisconnected = true;
      }
    }
    if (anyDisconnected || !sent) this._queuePending(event, sentTo);
    else if (event?.id) this._pendingIds.delete(event.id);
    return sent;
  }

  // Tracks delivery per relay URL, not just "sent to at least one" — a relay
  // mid-reconnect during a partial outage otherwise never gets the event.
  _queuePending(event, sentTo) {
    if (event?.id && this._pendingIds.has(event.id)) {
      const existing = this.pending.find((p) => p.event?.id === event.id);
      if (existing) { for (const url of sentTo) existing.sentTo.add(url); }
      return;
    }
    if (event?.id) this._pendingIds.add(event.id);
    this.pending.push({ event, sentTo, ts: Date.now() });
    while (this.pending.length > PENDING_MAX) {
      const dropped = this.pending.shift();
      if (dropped.event?.id) this._pendingIds.delete(dropped.event.id);
    }
  }

  // Resolves true once any relay sends OK accepted, false on relay reject,
  // or false on timeout. Gives callers delivery confidence beyond fire-and-forget.
  publishAndWait(event, { timeoutMs = 8000 } = {}) {
    const sent = this.publish(event);
    if (!event?.id) return Promise.resolve(sent);
    return new Promise((resolve) => {
      const prior = this._acks.get(event.id);
      if (prior) clearTimeout(prior.timer);
      const settle = (ok) => {
        const rec = this._acks.get(event.id);
        if (rec) { clearTimeout(rec.timer); this._acks.delete(event.id); }
        resolve(ok);
      };
      const timer = setTimeout(() => settle(false), timeoutMs);
      this._acks.set(event.id, { resolve: settle, timer });
    });
  }

  _settleAck(id, accepted) {
    const rec = this._acks.get(id);
    if (rec) rec.resolve(accepted);
  }

  _drainPending(url, ws) {
    const cutoff = Date.now() - PENDING_TTL_MS;
    this.pending = this.pending.filter((entry) => {
      const alive = entry.ts >= cutoff;
      if (!alive && entry.event?.id) this._pendingIds.delete(entry.event.id);
      return alive;
    });
    if (ws) {
      for (const entry of this.pending) {
        if (!entry.sentTo) entry.sentTo = new Set();
        if (entry.sentTo.has(url)) continue;
        ws.send(JSON.stringify(['EVENT', entry.event]));
        entry.sentTo.add(url);
      }
    }
    this.pending = this.pending.filter((entry) => {
      let anyConnected = false;
      let allKnownSent = true;
      for (const [u, r] of this.relays) {
        if (r.ws?.readyState === 1) {
          anyConnected = true;
          if (!entry.sentTo?.has(u)) { allKnownSent = false; break; }
        }
      }
      if (!anyConnected) allKnownSent = false;
      if (allKnownSent && entry.event?.id) this._pendingIds.delete(entry.event.id);
      return !allKnownSent;
    });
  }

  isConnected() {
    for (const [, r] of this.relays) if (r.ws?.readyState === 1) return true;
    return false;
  }

  status() {
    const out = [];
    for (const [url, r] of this.relays) out.push({ url, status: r.status, latencyMs: r.latencyMs });
    return out;
  }

  heal() {
    for (const [url, r] of this.relays) {
      if (!r.ws || r.ws.readyState === 2 || r.ws.readyState === 3) {
        r.reconnectDelay = 1000;
        this._open(url);
      }
    }
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}

export const createRelayPool = (opts) => new RelayPool(opts);
