import { dtag, parseDtag } from './dtag.js';

const AUDIT_LOG_MAX = 200;

export class Bans extends EventTarget {
  constructor({ relayPool, auth = null, roles = null }) {
    super();
    if (!relayPool) throw new Error('Bans: relayPool required');
    this.pool = relayPool; this.auth = auth; this.roles = roles;
    this.store = new Map();
    this.subs = new Map();
    // In-memory audit log of moderation actions seen via subscribe(), most
    // recent first, capped at AUDIT_LOG_MAX. Rebuilt purely from the same
    // real relay-published events the ban/timeout/kick/unban/mute state
    // already derives from — no separate write path, so the log can never
    // drift from the actual enforced state.
    this.auditLog = [];
  }

  isBanned(serverId, pubkey) { return !!(this.store.get(serverId)?.banned || []).includes(pubkey); }
  isKicked(serverId, pubkey) { return !!(this.store.get(serverId)?.kicked || []).includes(pubkey); }
  isMuted(serverId, channelId, pubkey) { return !!(this.store.get(serverId)?.muted?.[channelId] || []).includes(pubkey); }

  isTimedOut(serverId, pubkey) {
    const t = this.store.get(serverId)?.timeouts?.[pubkey];
    return !!t && t.expiry > Math.floor(Date.now() / 1000);
  }

  async ban(serverId, pubkey) {
    if (!this.auth?.isLoggedIn()) throw new Error('Not logged in');
    if (this.roles && !this.roles.isAdmin(serverId)) throw new Error('Insufficient permissions');
    const dTag = dtag('ban', serverId, pubkey);
    const signed = await this.auth.sign({
      kind: 30078, created_at: Math.floor(Date.now() / 1000),
      tags: [['d', dTag], ['server', serverId]],
      content: JSON.stringify({ action: 'ban', pubkey, timestamp: Math.floor(Date.now() / 1000) })
    });
    this.pool.publish(signed);
  }

  // Reverses a prior ban. A separate 'unban' d-tag namespace (not a delete
  // of the 'ban' event — nostr relays aren't guaranteed to honor NIP-09
  // deletion requests, and a replaceable/addressable ban event has no
  // built-in revocation) whose presence with a newer timestamp than the
  // matching ban event means "no longer banned" — see _applyEvent's ordering.
  async unban(serverId, pubkey) {
    if (!this.auth?.isLoggedIn()) throw new Error('Not logged in');
    if (this.roles && !this.roles.isAdmin(serverId)) throw new Error('Insufficient permissions');
    const dTag = dtag('unban', serverId, pubkey);
    const signed = await this.auth.sign({
      kind: 30078, created_at: Math.floor(Date.now() / 1000),
      tags: [['d', dTag], ['server', serverId]],
      content: JSON.stringify({ action: 'unban', pubkey, timestamp: Math.floor(Date.now() / 1000) })
    });
    this.pool.publish(signed);
  }

  async timeout(serverId, pubkey, minutes) {
    if (!this.auth?.isLoggedIn()) throw new Error('Not logged in');
    if (this.roles && !this.roles.isAdmin(serverId)) throw new Error('Insufficient permissions');
    const expiry = Math.floor(Date.now() / 1000) + (minutes * 60);
    const dTag = dtag('timeout', serverId, pubkey);
    const signed = await this.auth.sign({
      kind: 30078, created_at: Math.floor(Date.now() / 1000),
      tags: [['d', dTag], ['server', serverId]],
      content: JSON.stringify({ action: 'timeout', pubkey, expiry })
    });
    this.pool.publish(signed);
  }

  // Explicit early-clear of an active timeout — publishing a new timeout
  // event with expiry already in the past is the wire-level mechanism
  // (mirrors how the existing subscribe() handler already deletes an
  // expired timeout from the local store), exposed as its own method so a
  // caller doesn't have to know that trick.
  async clearTimeout(serverId, pubkey) {
    if (!this.auth?.isLoggedIn()) throw new Error('Not logged in');
    if (this.roles && !this.roles.isAdmin(serverId)) throw new Error('Insufficient permissions');
    const dTag = dtag('timeout', serverId, pubkey);
    const signed = await this.auth.sign({
      kind: 30078, created_at: Math.floor(Date.now() / 1000),
      tags: [['d', dTag], ['server', serverId]],
      content: JSON.stringify({ action: 'timeout', pubkey, expiry: Math.floor(Date.now() / 1000) - 1 })
    });
    this.pool.publish(signed);
  }

  async kickFromVoice(pubkey) {
    if (!this.auth?.isLoggedIn()) throw new Error('Not logged in');
    const signed = await this.auth.sign({
      kind: 30078, created_at: Math.floor(Date.now() / 1000),
      tags: [['d', dtag('kick', pubkey)]], content: ''
    });
    this.pool.publish(signed);
  }

  // Channel-level mute (distinct from a server-wide ban/timeout): silences
  // one pubkey in one channel only, e.g. for a channel-specific moderator
  // without server-wide admin rights over the whole server's ban list.
  async mute(serverId, channelId, pubkey) {
    if (!this.auth?.isLoggedIn()) throw new Error('Not logged in');
    if (this.roles && !this.roles.isMod(serverId)) throw new Error('Insufficient permissions');
    const dTag = dtag('mute', serverId, channelId, pubkey);
    const signed = await this.auth.sign({
      kind: 30078, created_at: Math.floor(Date.now() / 1000),
      tags: [['d', dTag], ['server', serverId], ['channel', channelId]],
      content: JSON.stringify({ action: 'mute', pubkey, channelId, timestamp: Math.floor(Date.now() / 1000) })
    });
    this.pool.publish(signed);
  }

  async unmute(serverId, channelId, pubkey) {
    if (!this.auth?.isLoggedIn()) throw new Error('Not logged in');
    if (this.roles && !this.roles.isMod(serverId)) throw new Error('Insufficient permissions');
    const dTag = dtag('mute', serverId, channelId, pubkey);
    const signed = await this.auth.sign({
      kind: 30078, created_at: Math.floor(Date.now() / 1000),
      tags: [['d', dTag], ['server', serverId], ['channel', channelId]],
      content: JSON.stringify({ action: 'unmute', pubkey, channelId, timestamp: Math.floor(Date.now() / 1000) })
    });
    this.pool.publish(signed);
  }

  // Most-recent-first audit trail of every moderation action seen via
  // subscribe() for this serverId (or all servers if serverId is omitted),
  // capped at AUDIT_LOG_MAX entries.
  getAuditLog(serverId = null) {
    return serverId ? this.auditLog.filter((e) => e.serverId === serverId) : this.auditLog.slice();
  }

  _recordAudit(entry) {
    this.auditLog.unshift(entry);
    if (this.auditLog.length > AUDIT_LOG_MAX) this.auditLog.length = AUDIT_LOG_MAX;
    this._emit('audit', { entry });
  }

  subscribe(serverId) {
    if (this.subs.has(serverId)) return;
    if (!serverId) return;
    const creator = serverId.split(':')[0];
    if (!creator) return;
    const subId = 'bans-' + serverId;
    this.subs.set(serverId, subId);
    this.pool.subscribe(subId,
      [{ kinds: [30078], authors: [creator], '#server': [serverId] }],
      (event) => {
        if (event.pubkey !== creator) return;
        try {
          const dTag = event.tags.find(t => t[0] === 'd');
          if (!dTag?.[1]) return;
          const parsed = parseDtag(dTag[1]);
          if (!parsed || !['ban', 'unban', 'timeout', 'kick', 'mute'].includes(parsed.ns)) return;
          const pubkey = parsed.parts[parsed.parts.length - 1];
          const data = this.store.get(serverId) || { banned: [], timeouts: {}, kicked: [], muted: {}, _banTs: {} };
          data.muted = data.muted || {};
          data._banTs = data._banTs || {};
          // A relay-delivered event always carries created_at; default to
          // "now" only for a malformed/missing value so a legitimate action
          // is never silently dropped by an always-false comparison against
          // undefined (0 <= undefined is false in JS).
          const eventTs = Number.isFinite(event.created_at) ? event.created_at : Math.floor(Date.now() / 1000);

          // ban/unban share one addressable slot per pubkey (different
          // d-tag namespaces, so a relay won't collapse them as the same
          // replaceable event) — track the newest-seen timestamp per pubkey
          // so an out-of-order-delivered older event never undoes a newer
          // decision, same "latest wins" discipline roles.js/settings.js
          // already apply to their own single-namespace replaceable state.
          if (parsed.ns === 'ban' && pubkey) {
            if ((data._banTs[pubkey] || 0) <= eventTs) {
              data._banTs[pubkey] = eventTs;
              if (!data.banned.includes(pubkey)) data.banned.push(pubkey);
            }
          } else if (parsed.ns === 'unban' && pubkey) {
            if ((data._banTs[pubkey] || 0) <= eventTs) {
              data._banTs[pubkey] = eventTs;
              data.banned = data.banned.filter((p) => p !== pubkey);
            }
          } else if (parsed.ns === 'kick' && pubkey) {
            data.kicked = data.kicked || [];
            if (!data.kicked.includes(pubkey)) data.kicked.push(pubkey);
          } else if (parsed.ns === 'timeout' && pubkey) {
            const body = JSON.parse(event.content);
            if (body.expiry > Math.floor(Date.now() / 1000)) (data.timeouts = data.timeouts || {})[pubkey] = { expiry: body.expiry };
            else if (data.timeouts?.[pubkey]) delete data.timeouts[pubkey];
          } else if (parsed.ns === 'mute' && pubkey) {
            const body = JSON.parse(event.content);
            // d-tag shape is 'mute:<serverId>:<channelId>:<pubkey>' (see
            // mute()/unmute() above) -> parts = [serverId, channelId,
            // pubkey] after parseDtag strips the namespace; body.channelId
            // is the primary source (always present, set by mute()/unmute())
            // with the d-tag position as a defensive fallback.
            const channelId = body.channelId ?? parsed.parts[1];
            data.muted[channelId] = data.muted[channelId] || [];
            if (body.action === 'unmute') data.muted[channelId] = data.muted[channelId].filter((p) => p !== pubkey);
            else if (!data.muted[channelId].includes(pubkey)) data.muted[channelId].push(pubkey);
          }
          this.store.set(serverId, data);
          this.dispatchEvent(new CustomEvent('updated', { detail: { serverId, data } }));

          let body = null;
          try { body = JSON.parse(event.content); } catch {}
          this._recordAudit({ serverId, ns: parsed.ns, pubkey, actor: event.pubkey, action: body?.action || parsed.ns, at: eventTs, eventId: event.id });
        } catch {}
      });
  }

  unsubscribe(serverId) {
    const subId = this.subs.get(serverId);
    if (subId) { this.pool.unsubscribe(subId); this.subs.delete(serverId); }
  }
}

export const createBans = (opts) => new Bans(opts);
