var nostrNet = {
  relays: new Map(),
  subs: new Map(),
  pendingEvents: [],
  seenIds: new Set(),

  _makeRelayActor: function() {
    var machine = XState.createMachine({initial:'connecting',states:{connecting:{on:{connected:'connected',fail:'error'}},connected:{on:{fail:'error',disconnect:'disconnected'}},disconnected:{on:{reconnect:'connecting'}},error:{on:{reconnect:'connecting'}}}});
    var actor = XState.createActor(machine);
    actor.start();
    return actor;
  },

    connect: function() {
    var relays = (state.nostrRelays || []);
    for (var i = 0; i < relays.length; i++) nostrNet._openRelay(relays[i]);
  },

  disconnect: function() {
    nostrNet.relays.forEach(function(relay) {
      if (relay.ws) { relay.ws.onclose = null; relay.ws.onerror = null; relay.ws.close(); }
    });
    nostrNet.relays.clear();
  },

  _openRelay: function(url) {
    var existing = nostrNet.relays.get(url);
    if (existing && existing.ws && (existing.ws.readyState === 0 || existing.ws.readyState === 1)) return;
    var relay = existing || { ws: null, status: 'connecting', actor: null, reconnectDelay: 1000, failCount: 0, subIds: new Set(), latencyMs: null, _reqSentAt: null };
    relay.status = 'connecting';
    relay.latencyMs = null;
    if(!relay.actor) relay.actor = nostrNet._makeRelayActor();
    else relay.actor.send({type:'reconnect'});
    nostrNet.relays.set(url, relay);
    var ws;
    try { ws = new WebSocket(url); } catch (e) {
      relay.status = 'error'; relay.actor.send({type:'fail'}); nostrNet._updateRelayStatus(url, 'error');
      if (window.ui) ui.render.all(); return;
    }
    relay.ws = ws;
    ws.onopen = function() {
      relay.status = 'connected'; relay.actor.send({type:'connected'}); relay._openedAt = Date.now();
      nostrNet._updateRelayStatus(url, 'connected');
      var wasConnected = state.isConnected; state.isConnected = true;
      if (!wasConnected && window.ui) ui.render.all();
      nostrNet.subs.forEach(function(sub, subId) {
        var req = ['REQ', subId].concat(sub.filters);
        ws.send(JSON.stringify(req)); relay.subIds.add(subId);
        if (!relay._reqSentAt) relay._reqSentAt = Date.now();
      });
      nostrNet._drainPending();
    };
    ws.onmessage = function(e) {
      if (relay._reqSentAt && relay.latencyMs === null) {
        relay.latencyMs = Date.now() - relay._reqSentAt; relay._reqSentAt = null;
        nostrNet._updateRelayStatus(url, 'connected');
      }
      try { nostrNet._handleMessage(url, e.data); } catch (_) {}
    };
    ws.onerror = function() {
      relay.status = 'error'; nostrNet._updateRelayStatus(url, 'error');
      if (window.ui) ui.render.all();
    };
    ws.onclose = function() {
      relay.status = 'closed'; relay.actor.send({type:'fail'}); nostrNet._updateRelayStatus(url, 'error');
      var anyOpen = false;
      nostrNet.relays.forEach(function(r) { if (r.ws && r.ws.readyState === 1) anyOpen = true; });
      if (!anyOpen) state.isConnected = false;
      if (window.ui) ui.render.all();
      var sustained = relay._openedAt && (Date.now() - relay._openedAt) > 5000;
      if (sustained) { relay.failCount = 0; relay.reconnectDelay = 1000; }
      else { relay.failCount = (relay.failCount || 0) + 1; relay.reconnectDelay = Math.min(relay.reconnectDelay * 2, 30000); }
      relay._openedAt = null;
      nostrNet._reconnect(url, relay.reconnectDelay);
    };
  },

  _reconnect: function(url, delay) {
    setTimeout(function() {
      var relay = nostrNet.relays.get(url); if (!relay) return;
      relay.status = 'connecting'; nostrNet._openRelay(url);
    }, delay || 1000);
  },

  _handleMessage: function(url, rawData) {
    var msg = JSON.parse(rawData);
    if (!Array.isArray(msg) || msg.length < 2) return;
    var type = msg[0], subId = msg[1], sub;
    if (type === 'EVENT') {
      var event = msg[2]; if (!event || !event.id) return;
      if (event.created_at > Math.floor(Date.now() / 1000) + 300) return;
      if (nostrNet.seenIds.has(event.id)) return;
      var valid = true;
      if (window.NostrTools && NostrTools.verifyEvent) {
        try { valid = NostrTools.verifyEvent(event); } catch (_) { valid = false; }
      }
      if (!valid) return;
      nostrNet.seenIds.add(event.id); nostrNet._trimSeenIds();
      sub = nostrNet.subs.get(subId);
      if (sub && sub.onEvent) sub.onEvent(event);
    } else if (type === 'EOSE') {
      sub = nostrNet.subs.get(subId); if (sub && sub.onEose) sub.onEose();
    } else if (type === 'NOTICE') {
      console.warn('[nostr relay notice]', msg[1]);
    } else if (type === 'OK' && !msg[2]) {
      console.error('[nostr relay rejected event]', msg[1], msg[3] || '');
    }
  },

  _normSubId: function(subId) { return subId.length > 64 ? subId.slice(0, 64) : subId; },

  subscribe: function(subId, filters, onEvent, onEose) {
    subId = nostrNet._normSubId(subId);
    nostrNet.subs.set(subId, { filters: filters, onEvent: onEvent, onEose: onEose, relays: new Set() });
    nostrNet.relays.forEach(function(relay, url) {
      if (relay.ws && relay.ws.readyState === 1) {
        var req = ['REQ', subId].concat(filters); relay.ws.send(JSON.stringify(req));
        relay.subIds.add(subId); nostrNet.subs.get(subId).relays.add(url);
        if (!relay._reqSentAt) relay._reqSentAt = Date.now();
      }
    });
    return subId;
  },

  unsubscribe: function(subId) {
    subId = nostrNet._normSubId(subId);
    nostrNet.relays.forEach(function(relay) {
      if (relay.ws && relay.ws.readyState === 1 && relay.subIds.has(subId)) {
        relay.ws.send(JSON.stringify(['CLOSE', subId])); relay.subIds.delete(subId);
      }
    });
    nostrNet.subs.delete(subId);
  },

  publish: function(event) {
    var sent = false;
    nostrNet.relays.forEach(function(relay) {
      if (relay.ws && relay.ws.readyState === 1) { relay.ws.send(JSON.stringify(['EVENT', event])); sent = true; }
    });
    if (!sent) nostrNet.pendingEvents.push(event);
  },

  _drainPending: function() {
    var pending = nostrNet.pendingEvents.splice(0);
    for (var i = 0; i < pending.length; i++) nostrNet.publish(pending[i]);
  },

  isConnected: function() {
    var open = false;
    nostrNet.relays.forEach(function(r) { if (r.ws && r.ws.readyState === 1) open = true; });
    return open;
  },

  _updateRelayStatus: function(url, status) {
    var m = new Map(state.nostrRelayStatus || []); m.set(url, status); state.nostrRelayStatus = m;
  },

  _trimSeenIds: function() {
    if (nostrNet.seenIds.size > 10000) {
      var arr = Array.from(nostrNet.seenIds); nostrNet.seenIds = new Set(arr.slice(arr.length - 5000));
    }
  }
};
window.__zellous.net = nostrNet;
window.network = nostrNet;
window.nostrNet = nostrNet;

function _healRelays() {
  nostrNet.relays.forEach(function(relay, url) {
    if (!relay.ws || relay.ws.readyState === 2 || relay.ws.readyState === 3) nostrNet._openRelay(url);
  });
}
window.addEventListener('online', function() {
  nostrNet.relays.forEach(function(relay) { relay.reconnectDelay = 1000; });
  _healRelays();
});
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible') _healRelays();
});
window.__debugNet = { get relays() {
  var out = []; nostrNet.relays.forEach(function(r, url) { out.push({url: url, status: r.status, actorState: r.actor ? r.actor.getSnapshot().value : null, latencyMs: r.latencyMs}); }); return out;
}};
