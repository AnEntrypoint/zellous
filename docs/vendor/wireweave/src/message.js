import { safeSetItem } from './safe-storage.js';

const STORE_KEY_PREFIX = 'ww_msgbus_';
const OUTBOX_KEY_PREFIX = 'ww_msgbus_outbox_';
const PERSIST_DEBOUNCE_MS = 500;

// Offline-first: MessageBus was purely in-memory (this.messages array,
// capped, gone on reload). storage (any localStorage/IndexedDB-shaped
// getItem/setItem/removeItem sync API — matches the same duck-typed
// contract safe-storage.js/RelayPool's health persistence already use)
// makes the message list survive a reload, keyed by `roomKey` so multiple
// rooms/channels don't collide. sendFn is the actual network send (e.g.
// pool.publish / a Chat.send wrapper) — add() calls it immediately if
// online, or queues into a persisted outbox if offline/sendFn throws/isn't
// connected, flushed automatically once flushOutbox() is called (e.g. on a
// relay 'relay-status':'connected' event from the caller).
export class MessageBus extends EventTarget {
  constructor({ maxMessages = 50, storage = null, roomKey = 'default', sendFn = null, isOnline = () => true } = {}) {
    super();
    this.max = maxMessages;
    this.messages = [];
    this.handlers = {};
    this.storage = storage;
    this.roomKey = roomKey;
    this.sendFn = sendFn;
    this.isOnline = isOnline;
    this.outbox = [];
    this._persistTimer = null;
    this._loadPersisted();
    this._loadOutbox();
  }

  handle(m) { this.handlers[m.type]?.(m); }
  register(type, fn) { this.handlers[type] = fn; }

  // Adds a message locally (always, immediately — the local view is never
  // blocked on network state) and, if a sendFn is configured, attempts the
  // real send. Offline (isOnline() false) or a throwing/failing sendFn
  // routes the message into a persisted outbox instead of losing it.
  add(text, { audioData = null, userId = null, username = null } = {}) {
    const msg = { id: Date.now().toString(36) + Math.random().toString(36).slice(2), text, time: Date.now(), userId, username, audioData, pending: false };
    if (this.sendFn) {
      const online = this.isOnline();
      if (!online) {
        msg.pending = true;
        this._queueOutbox(msg);
      } else {
        try {
          const result = this.sendFn(msg);
          if (result === false) { msg.pending = true; this._queueOutbox(msg); }
        } catch {
          msg.pending = true;
          this._queueOutbox(msg);
        }
      }
    }
    this.messages = [...this.messages, msg];
    if (this.messages.length > this.max) this.messages = this.messages.slice(-this.max);
    this._schedulePersist();
    this.dispatchEvent(new CustomEvent('message', { detail: msg }));
    this.dispatchEvent(new CustomEvent('messages', { detail: { list: this.messages } }));
    return msg;
  }

  // Retries every outboxed (offline-queued) message through sendFn, in
  // original order. A message that sends successfully this pass is marked
  // pending:false and removed from the outbox; one that still fails stays
  // queued for the next flush call. Call this when connectivity is
  // restored (e.g. from a relay-pool 'relay-status' handler).
  flushOutbox() {
    if (!this.sendFn || this.outbox.length === 0) return { sent: 0, remaining: this.outbox.length };
    const stillPending = [];
    let sent = 0;
    for (const msg of this.outbox) {
      let ok = false;
      try { ok = this.sendFn(msg) !== false; } catch { ok = false; }
      if (ok) {
        sent++;
        const local = this.messages.find((m) => m.id === msg.id);
        if (local) local.pending = false;
      } else {
        stillPending.push(msg);
      }
    }
    this.outbox = stillPending;
    this._persistOutbox();
    if (sent > 0) this.dispatchEvent(new CustomEvent('messages', { detail: { list: this.messages } }));
    this.dispatchEvent(new CustomEvent('outbox-flushed', { detail: { sent, remaining: this.outbox.length } }));
    return { sent, remaining: this.outbox.length };
  }

  getOutbox() { return this.outbox.slice(); }

  _queueOutbox(msg) {
    this.outbox.push(msg);
    this._persistOutbox();
  }

  _schedulePersist() {
    if (!this.storage) return;
    if (this._persistTimer) return;
    this._persistTimer = setTimeout(() => { this._persistTimer = null; this._persistNow(); }, PERSIST_DEBOUNCE_MS);
  }

  _persistNow() {
    if (!this.storage) return;
    safeSetItem(this.storage, this, STORE_KEY_PREFIX + this.roomKey, JSON.stringify(this.messages));
  }

  _persistOutbox() {
    if (!this.storage) return;
    safeSetItem(this.storage, this, OUTBOX_KEY_PREFIX + this.roomKey, JSON.stringify(this.outbox));
  }

  _loadPersisted() {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(STORE_KEY_PREFIX + this.roomKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) this.messages = parsed.slice(-this.max);
    } catch { /* corrupt/absent persisted messages is non-fatal */ }
  }

  _loadOutbox() {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(OUTBOX_KEY_PREFIX + this.roomKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) this.outbox = parsed;
    } catch { /* corrupt/absent persisted outbox is non-fatal */ }
  }

  // Clears BOTH the in-memory list and any persisted copy — a caller
  // switching rooms with a fresh MessageBus per room never needs this, but
  // one reusing a single MessageBus across rooms (changing roomKey) does.
  clear() {
    this.messages = [];
    this.outbox = [];
    if (this.storage) {
      try { this.storage.removeItem(STORE_KEY_PREFIX + this.roomKey); } catch {}
      try { this.storage.removeItem(OUTBOX_KEY_PREFIX + this.roomKey); } catch {}
    }
    this.dispatchEvent(new CustomEvent('messages', { detail: { list: this.messages } }));
  }
}

export const createMessageBus = (opts) => new MessageBus(opts);
