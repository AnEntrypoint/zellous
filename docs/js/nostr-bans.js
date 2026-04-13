var nostrBans = {
  _store: new Map(),
  _sub: null,

  isBanned(serverId, pubkey) {
    var bans = nostrBans._store.get(serverId) || {};
    return !!(bans.banned || []).includes(pubkey);
  },

  isTimedOut(serverId, pubkey) {
    var bans = nostrBans._store.get(serverId) || {};
    var timeout = bans.timeouts && bans.timeouts[pubkey];
    if (!timeout) return false;
    return timeout.expiry > Math.floor(Date.now() / 1000);
  },

  subscribe(serverId) {
    if (nostrBans._sub) { nostrNet.unsubscribe(nostrBans._sub); nostrBans._sub = null; }
    if (!serverId) return;
    var creator = serverId.split(':')[0];
    if (!creator) return;
    nostrBans._sub = 'bans-' + serverId;
    nostrNet.subscribe(nostrBans._sub,
      [{ kinds: [30078], authors: [creator], '#d': ['zellous-ban:' + serverId, 'zellous-timeout:' + serverId] }],
      function(event) {
        if (event.pubkey !== creator) return;
        try {
          var dTag = event.tags.find(function(t) { return t[0] === 'd'; });
          if (!dTag || !dTag[1]) return;
          var prefix = dTag[1].split(':')[0];
          var banData = nostrBans._store.get(serverId) || { banned: [], timeouts: {} };
          if (prefix === 'zellous-ban') {
            var pubkey = dTag[1].split(':')[2];
            if (pubkey && !banData.banned.includes(pubkey)) banData.banned.push(pubkey);
          } else if (prefix === 'zellous-timeout') {
            var pubkey = dTag[1].split(':')[2];
            if (pubkey) {
              var data = JSON.parse(event.content);
              if (data.expiry > Math.floor(Date.now() / 1000)) {
                if (!banData.timeouts) banData.timeouts = {};
                banData.timeouts[pubkey] = { expiry: data.expiry };
              } else if (banData.timeouts && banData.timeouts[pubkey]) {
                delete banData.timeouts[pubkey];
              }
            }
          }
          nostrBans._store.set(serverId, banData);
          if (window.__debug && window.__debug.bans) window.__debug.bans = Object.fromEntries(nostrBans._store);
        } catch(e) {}
      },
      function() {}
    );
  }
};

window.__zellous.bans = nostrBans;
window.nostrBans = nostrBans;
if (!window.__debug) window.__debug = {};
Object.defineProperty(window.__debug, 'bans', { get: function() { return Object.fromEntries(nostrBans._store); }, configurable: true });
