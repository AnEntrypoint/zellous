var serverManager = {
  loadServers: function() {
    try {
      var raw = localStorage.getItem('zn_servers');
      state.servers = raw ? JSON.parse(raw) : [];
    } catch (e) { state.servers = []; }

    if (state.nostrPubkey) {
      nostrNet.subscribe(
        'my-servers',
        [{ kinds: [34550], authors: [state.nostrPubkey] }],
        function(event) { serverManager._handleServerEvent(event); },
        function() {}
      );
    }

    try {
      var joined = localStorage.getItem('zn_joined_servers');
      var joinedIds = joined ? JSON.parse(joined) : [];
      joinedIds.forEach(function(sid) {
        if (!state.servers.find(function(s) { return s.id === sid; })) {
          state.servers = state.servers.concat([{ id: sid, name: sid.slice(0, 8), iconColor: '#5865F2' }]);
        }
      });
    } catch (e) {}
  },

  _handleServerEvent: function(event) {
    var nameTag = event.tags.find(function(t) { return t[0] === 'name'; });
    var colorTag = event.tags.find(function(t) { return t[0] === 'color'; });
    var dTag = event.tags.find(function(t) { return t[0] === 'd'; });
    if (!dTag) return;
    var serverId = event.pubkey + ':' + dTag[1];
    var name = nameTag ? nameTag[1] : serverId.slice(0, 8);
    var iconColor = colorTag ? colorTag[1] : '#5865F2';
    var existing = state.servers.find(function(s) { return s.id === serverId; });
    if (existing) {
      existing.name = name;
      existing.iconColor = iconColor;
      existing.ownerId = event.pubkey;
      state.servers = state.servers.slice();
    } else {
      state.servers = state.servers.concat([{ id: serverId, name: name, iconColor: iconColor, ownerId: event.pubkey }]);
    }
    serverManager._persistServers();
    ui.render.all();
  },

  create: async function(name, iconColor) {
    var dTag = Math.random().toString(36).slice(2, 10);
    var serverId = state.nostrPubkey + ':' + dTag;
    var template = {
      kind: 34550,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', dTag], ['name', name], ['color', iconColor || '#5865F2']],
      content: ''
    };
    var signed = await auth.sign(template);
    await nostrNet.publish(signed);
    var server = { id: serverId, name: name, iconColor: iconColor || '#5865F2', ownerId: state.nostrPubkey };
    state.servers = state.servers.concat([server]);
    serverManager._persistServers();
    serverManager.switchTo(serverId);
  },

  join: async function(serverId) {
    try {
      var joined = JSON.parse(localStorage.getItem('zn_joined_servers') || '[]');
      if (!joined.includes(serverId)) {
        joined.push(serverId);
        localStorage.setItem('zn_joined_servers', JSON.stringify(joined));
      }
    } catch (e) {}
    if (!state.servers.find(function(s) { return s.id === serverId; })) {
      state.servers = state.servers.concat([{ id: serverId, name: serverId.slice(0, 8), iconColor: '#5865F2' }]);
      serverManager._persistServers();
    }
    serverManager.switchTo(serverId);
  },

  switchTo: async function(serverId) {
    state.currentServerId = serverId;
    state.chatMessages = [];
    state.channels = [];
    state.categories = [];
    if (serverId) localStorage.setItem('zn_lastServer', serverId);
    else localStorage.removeItem('zn_lastServer');
    if (window.channelManager && serverId) {
      await new Promise(function(resolve) {
        var done = false;
        var finish = function() {
          if (done) return;
          done = true;
          if (!(state.channels || []).length) channelManager._setDefaults();
          resolve();
        };
        channelManager.loadChannels(serverId, finish);
        setTimeout(finish, 3000);
      });
    }
    var firstText = (state.channels || []).find(function(c) { return c.type === 'text'; });
    if (firstText && state.currentChannelId !== firstText.id) {
      state.currentChannelId = firstText.id;
      state.currentChannel = firstText;
      if (window.chat) chat.loadHistory(firstText.id);
    }
    ui.render.all();
  },

  _persistServers: function() {
    localStorage.setItem('zn_servers', JSON.stringify(state.servers));
  },

  init: function() {
    serverManager.loadServers();
    var lastServer = localStorage.getItem('zn_lastServer');
    if (lastServer && state.servers.find(function(s) { return s.id === lastServer; })) {
      serverManager.switchTo(lastServer);
    } else if (state.servers.length) {
      serverManager.switchTo(state.servers[0].id);
    }
  },

  _getOrder: function() {
    try { return JSON.parse(localStorage.getItem('zn_serverOrder') || '[]'); } catch (e) { return []; }
  },

  _saveOrder: function(ids) {
    localStorage.setItem('zn_serverOrder', JSON.stringify(ids));
  },

  _sortedServers: function() {
    var srvs = state.servers || [];
    var order = serverManager._getOrder();
    if (!order.length) return srvs;
    var indexed = {};
    order.forEach(function(id, i) { indexed[id] = i; });
    return srvs.slice().sort(function(a, b) {
      var ai = indexed[a.id] !== undefined ? indexed[a.id] : Infinity;
      var bi = indexed[b.id] !== undefined ? indexed[b.id] : Infinity;
      return ai - bi;
    });
  },

};

window.serverManager = serverManager;
