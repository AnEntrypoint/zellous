var nostrNet = {
  relays: new Map(),
  subs: new Map(),
  pendingEvents: [],
  seenIds: new Set(),

  connect: function() {
    var relays = (state.nostrRelays || []);
    for (var i = 0; i < relays.length; i++) {
      nostrNet._openRelay(relays[i]);
    }
  },

  disconnect: function() {
    nostrNet.relays.forEach(function(relay, url) {
      if (relay.ws) {
        relay.ws.onclose = null;
        relay.ws.onerror = null;
        relay.ws.close();
      }
    });
    nostrNet.relays.clear();
  },

  _openRelay: function(url) {
    var existing = nostrNet.relays.get(url);
    if (existing && existing.ws && (existing.ws.readyState === 0 || existing.ws.readyState === 1)) {
      return;
    }

    var relay = existing || { ws: null, status: 'connecting', reconnectDelay: 1000, subIds: new Set() };
    relay.status = 'connecting';
    nostrNet.relays.set(url, relay);

    var ws;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      relay.status = 'error';
      if (state.nostrRelayStatus) state.nostrRelayStatus.set(url, 'error');
      if (window.ui) ui.render.all();
      return;
    }

    relay.ws = ws;

    ws.onopen = function() {
      relay.status = 'connected';
      relay.reconnectDelay = 1000;
      if (state.nostrRelayStatus) state.nostrRelayStatus.set(url, 'connected');
      var wasConnected = state.isConnected;
      state.isConnected = true;
      if (!wasConnected && window.ui) ui.render.all();

      nostrNet.subs.forEach(function(sub, subId) {
        var filters = sub.filters;
        var req = ['REQ', subId].concat(filters);
        ws.send(JSON.stringify(req));
        relay.subIds.add(subId);
      });

      nostrNet._drainPending();
    };

    ws.onmessage = function(e) {
      try {
        nostrNet._handleMessage(url, e.data);
      } catch (_) {}
    };

    ws.onerror = function() {
      relay.status = 'error';
      if (state.nostrRelayStatus) state.nostrRelayStatus.set(url, 'error');
      if (window.ui) ui.render.all();
    };

    ws.onclose = function() {
      relay.status = 'closed';
      if (state.nostrRelayStatus) state.nostrRelayStatus.set(url, 'error');
      var anyOpen = false;
      nostrNet.relays.forEach(function(r) {
        if (r.ws && r.ws.readyState === 1) anyOpen = true;
      });
      if (!anyOpen) state.isConnected = false;
      if (window.ui) ui.render.all();
      nostrNet._reconnect(url, relay.reconnectDelay);
      relay.reconnectDelay = Math.min(relay.reconnectDelay * 2, 30000);
    };
  },

  _reconnect: function(url, delay) {
    setTimeout(function() {
      var relay = nostrNet.relays.get(url);
      if (!relay) return;
      relay.status = 'connecting';
      nostrNet._openRelay(url);
    }, delay || 1000);
  },

  _handleMessage: function(url, rawData) {
    var msg = JSON.parse(rawData);
    if (!Array.isArray(msg) || msg.length < 2) return;
    var type = msg[0], subId = msg[1], sub;
    if (type === 'EVENT') {
      var event = msg[2];
      if (!event || !event.id) return;
      if (event.created_at > Math.floor(Date.now() / 1000) + 300) return;
      if (nostrNet.seenIds.has(event.id)) return;
      var valid = true;
      if (window.NostrTools && NostrTools.verifyEvent) {
        try { valid = NostrTools.verifyEvent(event); } catch (_) { valid = false; }
      }
      if (!valid) return;
      nostrNet.seenIds.add(event.id);
      sub = nostrNet.subs.get(subId);
      if (sub && sub.onEvent) sub.onEvent(event);
    } else if (type === 'EOSE') {
      sub = nostrNet.subs.get(subId);
      if (sub && sub.onEose) sub.onEose();
    } else if (type === 'NOTICE') {
      console.warn('[nostr relay notice]', msg[1]);
    } else if (type === 'OK' && !msg[2]) {
      console.error('[nostr relay rejected event]', msg[1], msg[3] || '');
    }
  },

  subscribe: function(subId, filters, onEvent, onEose) {
    nostrNet.subs.set(subId, { filters: filters, onEvent: onEvent, onEose: onEose, relays: new Set() });

    nostrNet.relays.forEach(function(relay, url) {
      if (relay.ws && relay.ws.readyState === 1) {
        var req = ['REQ', subId].concat(filters);
        relay.ws.send(JSON.stringify(req));
        relay.subIds.add(subId);
        nostrNet.subs.get(subId).relays.add(url);
      }
    });

    return subId;
  },

  unsubscribe: function(subId) {
    nostrNet.relays.forEach(function(relay) {
      if (relay.ws && relay.ws.readyState === 1 && relay.subIds.has(subId)) {
        relay.ws.send(JSON.stringify(['CLOSE', subId]));
        relay.subIds.delete(subId);
      }
    });
    nostrNet.subs.delete(subId);
  },

  publish: function(event) {
    var sent = false;
    nostrNet.relays.forEach(function(relay) {
      if (relay.ws && relay.ws.readyState === 1) {
        relay.ws.send(JSON.stringify(['EVENT', event]));
        sent = true;
      }
    });
    if (!sent) {
      nostrNet.pendingEvents.push(event);
    }
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

  send: function() {},
  sendAudio: function() {}
};

var message = window.message || {
  handlers: {},
  handle: function(m) { var h = message.handlers[m.type]; if (h) h(m); },
  add: function(text, audioData, userId, username) {
    var id = Date.now() + Math.random();
    var msgs = (state.messages || []).concat([{ id: id, text: text, time: Date.now(), userId: userId, username: username }]);
    state.messages = msgs.length > 50 ? msgs.slice(-50) : msgs;
    if (window.ui) ui.render.messages();
  }
};

window.nostrNet = nostrNet;
window.network = nostrNet;
window.message = message;
