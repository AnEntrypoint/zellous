const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.snort.social'
];

const trim = (set, max, keep) => {
  if (set.size <= max) return set;
  const arr = Array.from(set);
  return new Set(arr.slice(arr.length - keep));
};

export class RelayPool extends EventTarget {
  constructor({ relays = DEFAULT_RELAYS, verifyEvent = null, WebSocketImpl = null } = {}) {
    super();
    this.urls = [...relays];
    this.relays = new Map();
    this.subs = new Map();
    this.pending = [];
    this.seen = new Set();
    this.verifyEvent = verifyEvent;
    this.WS = WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    if (!this.WS) throw new Error('No WebSocket implementation available');
  }

  connect() {
    for (const url of this.urls) this._open(url);
  }

  disconnect() {
    for (const [, r] of this.relays) {
      if (r.ws) { r.ws.onclose = null; r.ws.onerror = null; try { r.ws.close(); } catch {} }
    }
    this.relays.clear();
  }

  _open(url) {
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
    ws.onopen = () => {
      relay.status = 'connected';
      relay._openedAt = Date.now();
      this._emit('relay-status', { url, status: 'connected' });
      for (const [subId, sub] of this.subs) {
        ws.send(JSON.stringify(['REQ', subId, ...sub.filters]));
        relay.subIds.add(subId);
        if (!relay._reqSentAt) relay._reqSentAt = Date.now();
      }
      this._drainPending();
    };
    ws.onmessage = (e) => {
      if (relay._reqSentAt && relay.latencyMs === null) {
        relay.latencyMs = Date.now() - relay._reqSentAt;
        relay._reqSentAt = null;
      }
      try { this._handle(url, typeof e.data === 'string' ? e.data : e.data.toString()); } catch {}
    };
    ws.onerror = () => { relay.status = 'error'; this._emit('relay-status', { url, status: 'error' }); };
    ws.onclose = () => {
      relay.status = 'closed';
      this._emit('relay-status', { url, status: 'closed' });
      const sustained = relay._openedAt && Date.now() - relay._openedAt > 5000;
      if (sustained) { relay.failCount = 0; relay.reconnectDelay = 1000; }
      else { relay.failCount++; relay.reconnectDelay = Math.min(relay.reconnectDelay * 2, 30000); }
      relay._openedAt = null;
      setTimeout(() => this._open(url), relay.reconnectDelay);
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
      this.seen.add(event.id);
      this.seen = trim(this.seen, 10000, 5000);
      const sub = this.subs.get(subId);
      sub?.onEvent?.(event);
      this._emit('event', { subId, event });
    } else if (type === 'EOSE') {
      this.subs.get(subId)?.onEose?.();
      this._emit('eose', { subId });
    } else if (type === 'NOTICE') {
      this._emit('notice', { url, message: msg[1] });
    } else if (type === 'OK' && !msg[2]) {
      this._emit('reject', { id: msg[1], reason: msg[3] || '' });
    }
  }

  subscribe(subId, filters, onEvent, onEose) {
    subId = subId.length > 64 ? subId.slice(0, 64) : subId;
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
    subId = subId.length > 64 ? subId.slice(0, 64) : subId;
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
    for (const [, relay] of this.relays) {
      if (relay.ws?.readyState === 1) {
        relay.ws.send(JSON.stringify(['EVENT', event]));
        sent = true;
      }
    }
    if (!sent) this.pending.push(event);
    return sent;
  }

  _drainPending() {
    const pending = this.pending.splice(0);
    for (const e of pending) this.publish(e);
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
