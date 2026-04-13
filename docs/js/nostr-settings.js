var serverSettings = {
  _store: new Map(),
  _sub: null,
  _VALID_BITRATES: [8000, 16000, 24000, 48000, 96000],

  _clampBitrate(v) {
    return serverSettings._VALID_BITRATES.reduce(function(prev, cur) {
      return Math.abs(cur - v) < Math.abs(prev - v) ? cur : prev;
    });
  },

  getBitrate(serverId) {
    var s = serverSettings._store.get(serverId);
    return (s && s.opusBitrate) || 24000;
  },

  async setBitrate(serverId, bitrate) {
    if (!serverRoles.isOwner(serverId) && !serverRoles.isAdmin(serverId)) throw new Error('Insufficient permissions');
    var clamped = serverSettings._clampBitrate(Number(bitrate));
    var existing = serverSettings._store.get(serverId) || {};
    var next = Object.assign({}, existing, { opusBitrate: clamped });
    serverSettings._store.set(serverId, next);
    var dTag = 'zellous-settings:' + serverId;
    var signed = await auth.sign({ kind: 30078, created_at: Math.floor(Date.now() / 1000), tags: [['d', dTag]], content: JSON.stringify(next) });
    await nostrNet.publish(signed);
    if (state.audioEncoder) {
      try { state.audioEncoder.configure({ codec: 'opus', sampleRate: config.sampleRate, numberOfChannels: 1, bitrate: clamped }); } catch(e) {}
    }
    return clamped;
  },

  subscribe(serverId) {
    if (serverSettings._sub) { nostrNet.unsubscribe(serverSettings._sub); serverSettings._sub = null; }
    if (!serverId) return;
    var creator = serverId.split(':')[0];
    if (!creator) return;
    var dTag = 'zellous-settings:' + serverId;
    serverSettings._sub = 'settings-' + serverId;
    nostrNet.subscribe(serverSettings._sub,
      [{ kinds: [30078], authors: [creator], '#d': [dTag] }],
      function(event) {
        if (event.pubkey !== creator) return;
        try {
          var data = JSON.parse(event.content);
          serverSettings._store.set(serverId, data);
        } catch(e) {}
      },
      function() {}
    );
  },

  applyToEncoder() {
    var bitrate = serverSettings.getBitrate(state.currentServerId);
    if (state.audioEncoder) {
      try { state.audioEncoder.configure({ codec: 'opus', sampleRate: config.sampleRate, numberOfChannels: 1, bitrate: bitrate }); } catch(e) {}
    }
  }
};

window.serverSettings = serverSettings;
if (!window.__debug) window.__debug = {};
Object.defineProperty(window.__debug, 'settings', { get: function() { return { store: Object.fromEntries(serverSettings._store), sub: serverSettings._sub }; }, configurable: true });
