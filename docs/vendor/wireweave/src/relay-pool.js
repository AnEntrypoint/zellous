import { safeSetItem } from './safe-storage.js';
import * as debug from './debug.js';

// Ordered fastest-first by measured connect latency; dead relays removed so
// signaling reaches a live relay immediately instead of racing dead hosts.
// (relay.nostr.band / nostr.wine / relay.current.fyi / relay.0xchat.com were
// unreachable — DNS-dead or refusing connections — and only added connect
// latency and console noise. Re-audit periodically.)
const DEFAULT_RELAYS = [
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://offchain.pub',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.snort.social',
  'wss://relay.damus.io'
];

// Backup pool candidates auto-rotation can promote in when a connected relay's
// health score falls below a healthy alternative's — never DEFAULT_RELAYS
// members already in play, so rotation always trades toward strictly-better.
const FALLBACK_RELAYS = [
  'wss://relay.nostr.band',
  'wss://nostr.wine',
  'wss://relay.current.fyi',
  'wss://relay.0xchat.com'
];

const SEEN_MAX = 10000;
const PENDING_MAX = 500;
const PENDING_TTL_MS = 120000;
const CONNECT_TIMEOUT_MS = 10000;
const jitter = (ms) => Math.round(ms * (0.75 + Math.random() * 0.5));

// EWMA smoothing for latency/EOSE-speed samples — recent samples dominate but
// a single slow sample doesn't crater a relay's score outright.
const EWMA_ALPHA = 0.3;
const ewma = (prev, sample) => prev === null ? sample : prev + EWMA_ALPHA * (sample - prev);

const HEALTH_STORAGE_KEY = 'ww_relay_health';
const HEALTH_SAVE_DEBOUNCE_MS = 2000;

// health.rank: 0..100, higher is better. Weighted blend of connect latency,
// EOSE response speed, and uptime ratio (successful sustained connections vs
// total attempts). Missing samples (relay never connected / no EOSE seen yet)
// score neutral (50) for that component rather than zero, so a fresh relay
// isn't unfairly punished before it has a chance to report real numbers.
const scoreLatency = (ms) => ms === null ? 50 : Math.max(0, 100 - Math.min(ms, 3000) / 30);
const scoreEose = (ms) => ms === null ? 50 : Math.max(0, 100 - Math.min(ms, 5000) / 50);
const scoreUptime = (attempts, successes) => attempts === 0 ? 50 : Math.round((successes / attempts) * 100);

const computeRank = (health) => Math.round(
  0.35 * scoreLatency(health.connectLatencyMs) +
  0.35 * scoreEose(health.eoseLatencyMs) +
  0.30 * scoreUptime(health.attempts, health.successes)
);

class RelayHealth {
  constructor(url) {
    this.url = url;
    this.connectLatencyMs = null;
    this.eoseLatencyMs = null;
    this.attempts = 0;
    this.successes = 0;
    this.rank = 50;
  }

  // Recomputes rank on every attempt, not just on a successful signal —
  // otherwise a relay that NEVER once connects (rank frozen at the ctor's
  // neutral 50 forever, since recordConnectLatency/recordSustainedConnection/
  // recordEoseLatency — the only other rank-recomputing call sites — never
  // fire for it) reads as perpetually "average" no matter how many failed
  // attempts pile up, defeating both healthReport() ranking and
  // _maybeRotate's rank-gap rotation trigger for the exact "never connects
  // at all" relay auto-rotation exists to route around.
  recordConnectAttempt() { this.attempts++; this.rank = computeRank(this); }

  recordConnectLatency(ms) {
    this.connectLatencyMs = ewma(this.connectLatencyMs, ms);
    this.rank = computeRank(this);
  }

  recordSustainedConnection() {
    this.successes++;
    this.rank = computeRank(this);
  }

  recordEoseLatency(ms) {
    this.eoseLatencyMs = ewma(this.eoseLatencyMs, ms);
    this.rank = computeRank(this);
  }

  toJSON() {
    return {
      url: this.url,
      connectLatencyMs: this.connectLatencyMs,
      eoseLatencyMs: this.eoseLatencyMs,
      attempts: this.attempts,
      successes: this.successes,
      rank: this.rank
    };
  }

  static fromJSON(obj) {
    const h = new RelayHealth(obj.url);
    h.connectLatencyMs = obj.connectLatencyMs ?? null;
    h.eoseLatencyMs = obj.eoseLatencyMs ?? null;
    h.attempts = obj.attempts ?? 0;
    h.successes = obj.successes ?? 0;
    h.rank = obj.rank ?? computeRank(h);
    return h;
  }
}

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

// Shared publish budget: a real token bucket, refilled continuously at
// refillPerSec tokens/sec up to burstCap, drained one token per publish()
// call. This is the SINGLE choke point every module's writes go through
// (chat, dm, bans, roles, settings, servers, data-channel signaling all
// call pool.publish()) so one shared bucket per RelayPool instance budgets
// abuse across all of them at once, rather than each module needing (and
// forgetting) its own independent limiter — chat.js's own 5-per-10s limiter
// stays as an app-level UX throttle (rate-limited event + retryAfterMs for
// a chat input box), this is the lower-level protocol-wide backstop.
const DEFAULT_BUDGET_BURST = 30;
const DEFAULT_BUDGET_REFILL_PER_SEC = 3;

class PublishBudget {
  constructor({ burstCap = DEFAULT_BUDGET_BURST, refillPerSec = DEFAULT_BUDGET_REFILL_PER_SEC } = {}) {
    this.burstCap = burstCap;
    this.refillPerSec = refillPerSec;
    this.tokens = burstCap;
    this.lastRefillAt = Date.now();
  }

  _refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillAt) / 1000;
    if (elapsedSec <= 0) return;
    this.tokens = Math.min(this.burstCap, this.tokens + elapsedSec * this.refillPerSec);
    this.lastRefillAt = now;
  }

  // Returns true and consumes a token if available, else false (caller
  // decides what "budget exceeded" means — RelayPool.publish() below
  // queues the event as pending rather than dropping it, since a
  // rate-limited-not-lost event still eventually goes out once the bucket
  // refills, via the same _drainPending path a disconnected relay uses).
  tryConsume() {
    this._refill();
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  retryAfterMs() {
    this._refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil((1 - this.tokens) / this.refillPerSec * 1000);
  }
}

export class RelayPool extends EventTarget {
  constructor({ relays = DEFAULT_RELAYS, verifyEvent = null, WebSocketImpl = null, storage = null, fallbackRelays = FALLBACK_RELAYS, autoRotate = true, publishBudget = {} } = {}) {
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

    this.storage = storage;
    this.autoRotate = autoRotate;
    this.fallbackRelays = [...fallbackRelays];
    this.health = new Map();
    for (const url of this.urls) this.health.set(url, new RelayHealth(url));
    this._loadHealth();
    this._saveHealthTimer = null;
    // publishBudget:false disables the budget entirely (unbounded, the old
    // behavior) — anything else (including {}) gets a real token bucket.
    this.budget = publishBudget === false ? null : new PublishBudget(publishBudget);
    this._budgetDrainTimer = null;

    // Debug-panel integration: window.__wireweave.relayPool (or relayPool2,
    // relayPool3... for additional instances) exposes healthReport() live.
    this._debugKey = 'relayPool';
    let n = 2;
    while (debug.get(this._debugKey)) this._debugKey = 'relayPool' + n++;
    debug.register(this._debugKey, this);
  }

  // --- Health scoring / persistence -------------------------------------

  _getHealth(url) {
    let h = this.health.get(url);
    if (!h) { h = new RelayHealth(url); this.health.set(url, h); }
    return h;
  }

  _loadHealth() {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(HEALTH_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (const entry of parsed) {
        if (!entry?.url) continue;
        this.health.set(entry.url, RelayHealth.fromJSON(entry));
      }
    } catch { /* corrupt/absent persisted health is non-fatal — scores rebuild live */ }
  }

  _scheduleSaveHealth() {
    if (!this.storage) return;
    if (this._saveHealthTimer) return;
    this._saveHealthTimer = setTimeout(() => {
      this._saveHealthTimer = null;
      this._saveHealthNow();
    }, HEALTH_SAVE_DEBOUNCE_MS);
  }

  _saveHealthNow() {
    if (!this.storage) return;
    const out = [];
    for (const [, h] of this.health) out.push(h.toJSON());
    safeSetItem(this.storage, this, HEALTH_STORAGE_KEY, JSON.stringify(out));
  }

  // Sorted best-first snapshot for a debug panel / inspection.
  healthReport() {
    const out = [];
    for (const [, h] of this.health) out.push(h.toJSON());
    out.sort((a, b) => b.rank - a.rank);
    return out;
  }

  // Swap the worst currently-active relay for the best-ranked unused
  // candidate (fallback pool, or a previously-tried relay we disconnected
  // from) when the gap is large enough to be worth the churn of a new
  // connection. Never rotates below MIN_ACTIVE_RELAYS active URLs. Called
  // from every ws.onclose (both the sustained-then-dropped branch AND the
  // never-connected/failed-fast branch) — a relay that never manages to
  // connect at all still needs evaluating here, since that IS the
  // "consistently unhealthy" case rotation exists to route around, and its
  // rank already reflects the failures via recordConnectAttempt's own
  // computeRank call once attempts >= 2 (the sample floor enforced below).
  _maybeRotate() {
    if (!this.autoRotate || this._closed) return;
    const MIN_ACTIVE_RELAYS = 2;
    const ROTATE_GAP = 20;
    if (this.urls.length <= MIN_ACTIVE_RELAYS) return;

    const active = this.urls
      .map((url) => this._getHealth(url))
      .filter((h) => h.attempts >= 2); // need a couple of samples before judging
    if (active.length === 0) return;
    const worst = active.reduce((a, b) => (a.rank <= b.rank ? a : b));

    const candidates = this.fallbackRelays.filter((u) => !this.urls.includes(u));
    if (candidates.length === 0) return;
    const candidateHealth = candidates.map((u) => this._getHealth(u));
    const best = candidateHealth.reduce((a, b) => (a.rank >= b.rank ? a : b));
    // Only rotate toward a candidate with real observed history beating the
    // worst active relay by a wide margin — an untested candidate (rank 50
    // neutral default) never displaces a relay with a real track record.
    if (best.attempts === 0) return;
    if (best.rank - worst.rank < ROTATE_GAP) return;

    this._rotate(worst.url, best.url);
  }

  _rotate(outUrl, inUrl) {
    const idx = this.urls.indexOf(outUrl);
    if (idx === -1) return;
    this.urls[idx] = inUrl;
    this.fallbackRelays = this.fallbackRelays.filter((u) => u !== inUrl);
    this.fallbackRelays.push(outUrl);

    const old = this.relays.get(outUrl);
    if (old) {
      if (old._connectTimer) clearTimeout(old._connectTimer);
      if (old.ws) { old.ws.onclose = null; old.ws.onerror = null; old.ws.onopen = null; old.ws.onmessage = null; try { old.ws.close(); } catch {} }
      this.relays.delete(outUrl);
    }
    const t = this._reconnectTimers.get(outUrl);
    if (t) { clearTimeout(t); this._reconnectTimers.delete(outUrl); }

    this._emit('relay-rotated', { out: outUrl, in: inUrl, outRank: this._getHealth(outUrl).rank, inRank: this._getHealth(inUrl).rank });
    if (!this._closed) this._open(inUrl);
  }

  connect() {
    this._closed = false;
    for (const url of this.urls) this._open(url);
  }

  disconnect() {
    this._closed = true;
    for (const [, t] of this._reconnectTimers) clearTimeout(t);
    this._reconnectTimers.clear();
    if (this._budgetDrainTimer) { clearTimeout(this._budgetDrainTimer); this._budgetDrainTimer = null; }
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
    if (this._saveHealthTimer) { clearTimeout(this._saveHealthTimer); this._saveHealthTimer = null; }
    this._saveHealthNow();
    debug.deregister(this._debugKey);
  }

  _open(url) {
    if (this._closed) return;
    this._reconnectTimers.delete(url);
    const existing = this.relays.get(url);
    if (existing?.ws && (existing.ws.readyState === 0 || existing.ws.readyState === 1)) return;
    const relay = existing || { ws: null, status: 'connecting', subIds: new Set(), latencyMs: null, failCount: 0, reconnectDelay: 1000, _reqSentAt: null, _openedAt: null, _eoseReqSentAt: new Map() };
    if (!relay._eoseReqSentAt) relay._eoseReqSentAt = new Map();
    relay.status = 'connecting';
    relay.latencyMs = null;
    this.relays.set(url, relay);
    const health = this._getHealth(url);
    health.recordConnectAttempt();
    const connectStartedAt = Date.now();
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
      health.recordConnectLatency(relay._openedAt - connectStartedAt);
      this._scheduleSaveHealth();
      this._emit('relay-status', { url, status: 'connected' });
      for (const [subId, sub] of this.subs) {
        ws.send(JSON.stringify(['REQ', subId, ...sub.filters]));
        relay.subIds.add(subId);
        if (!relay._reqSentAt) relay._reqSentAt = Date.now();
        relay._eoseReqSentAt.set(subId, Date.now());
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
      if (sustained) {
        relay.failCount = 0;
        relay.reconnectDelay = 1000;
        health.recordSustainedConnection();
        this._scheduleSaveHealth();
      } else {
        relay.failCount++;
        relay.reconnectDelay = Math.min(relay.reconnectDelay * 2, 30000);
      }
      // Evaluate rotation on EVERY close, not just a sustained-then-dropped
      // connection — a relay that never manages to connect at all (the
      // `else` branch above) is exactly the "consistently unhealthy"
      // relay auto-rotation exists to route around, and its rank already
      // reflects that via computeRank's uptime/latency components once
      // `attempts >= 2` (the sample floor _maybeRotate itself enforces).
      this._maybeRotate();
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
      const relay = this.relays.get(url);
      const sentAt = relay?._eoseReqSentAt?.get(subId);
      if (sentAt) {
        relay._eoseReqSentAt.delete(subId);
        this._getHealth(url).recordEoseLatency(Date.now() - sentAt);
        this._scheduleSaveHealth();
      }
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
        if (!relay._eoseReqSentAt) relay._eoseReqSentAt = new Map();
        relay._eoseReqSentAt.set(subId, Date.now());
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

  // Budget-gated: over-budget calls are not dropped, they're queued exactly
  // like a disconnected-relay event (via _queuePending) and flushed by the
  // normal _drainPending path once either a relay reconnects or, for a
  // budget-only rejection, the next successful publish()/heal() drains the
  // backlog opportunistically. This means a caller that publishes faster
  // than the budget allows sees eventual delivery, not silent loss — the
  // same "fire-and-forget with delivery confidence via publishAndWait()"
  // contract the rest of this class already documents.
  publish(event) {
    if (this.budget && !this.budget.tryConsume()) {
      this._emit('rate-limited', { retryAfterMs: this.budget.retryAfterMs() });
      this._queuePending(event, new Set());
      this._scheduleBudgetDrain();
      return false;
    }
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

  // Live budget introspection for a debug panel / caller backoff decision.
  budgetStatus() {
    if (!this.budget) return { enabled: false };
    this.budget._refill();
    return { enabled: true, tokens: this.budget.tokens, burstCap: this.budget.burstCap, refillPerSec: this.budget.refillPerSec, retryAfterMs: this.budget.retryAfterMs() };
  }

  // A budget-rejected publish() queues into `this.pending` exactly like a
  // disconnected-relay event, but `this.pending` otherwise only drains on
  // ws.onopen (a relay reconnecting) — if every relay stays connected the
  // whole time, a budget-queued event needs its OWN retry path once tokens
  // refill, or it would sit queued until PENDING_TTL_MS expiry and get
  // silently dropped despite the relay connection being perfectly healthy.
  // One timer, scheduled only while budget-queued events are outstanding
  // (never a standing interval), retries a real drain against every
  // currently-open relay once the bucket should have refilled a token.
  _scheduleBudgetDrain() {
    if (this._budgetDrainTimer || !this.budget || this._closed) return;
    const delay = Math.max(50, this.budget.retryAfterMs());
    this._budgetDrainTimer = setTimeout(() => {
      this._budgetDrainTimer = null;
      if (this._closed) return;
      let anyOpen = false;
      for (const [url, relay] of this.relays) {
        if (relay.ws?.readyState === 1) { anyOpen = true; this._drainPending(url, relay.ws); }
      }
      // Still budget-limited or nothing connected yet — keep retrying as
      // long as there's a real backlog, so it isn't stranded until TTL.
      if (this.pending.length > 0 && (anyOpen || this.budget.retryAfterMs() > 0)) this._scheduleBudgetDrain();
    }, delay);
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
export { RelayHealth };
