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
      // Subscribe to relay to fetch real names for joined (non-owned) servers
      var unresolved = joinedIds.filter(function(sid) {
        // Format: pubkey:dTag — only subscribe if not already owned by us
        var parts = sid.split(':');
        return parts.length === 2 && parts[0] !== state.nostrPubkey;
      });
      if (unresolved.length) {
        // Group by author to minimise subscriptions
        var byAuthor = {};
        unresolved.forEach(function(sid) {
          var parts = sid.split(':');
          var author = parts[0], dTag = parts[1];
          if (!byAuthor[author]) byAuthor[author] = [];
          byAuthor[author].push(dTag);
        });
        Object.keys(byAuthor).forEach(function(author) {
          var dTags = byAuthor[author];
          nostrNet.subscribe(
            'joined-server-' + author.slice(0, 8),
            [{ kinds: [34550], authors: [author], '#d': dTags }],
            function(event) { serverManager._handleServerEvent(event); },
            function() {}
          );
        });
      }
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
      existing.name = name; existing.iconColor = iconColor; existing.ownerId = event.pubkey;
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
    var template = { kind: 34550, created_at: Math.floor(Date.now() / 1000), tags: [['d', dTag], ['name', name], ['color', iconColor || '#5865F2']], content: '' };
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
      if (!joined.includes(serverId)) { joined.push(serverId); localStorage.setItem('zn_joined_servers', JSON.stringify(joined)); }
    } catch (e) {}
    if (!state.servers.find(function(s) { return s.id === serverId; })) {
      state.servers = state.servers.concat([{ id: serverId, name: serverId.slice(0, 8), iconColor: '#5865F2' }]);
      serverManager._persistServers();
    }
    serverManager.switchTo(serverId);
  },

  delete: async function(serverId) {
    state.servers = (state.servers || []).filter(function(s) { return s.id !== serverId; });
    serverManager._persistServers();
    try {
      var joined = JSON.parse(localStorage.getItem('zn_joined_servers') || '[]');
      localStorage.setItem('zn_joined_servers', JSON.stringify(joined.filter(function(id) { return id !== serverId; })));
    } catch (e) {}
    if (state.currentServerId === serverId) serverManager.switchTo(null);
    else ui.render.all();
  },

  leave: function(serverId) { serverManager.delete(serverId); },
  switchTo: async function(serverId) {
    state.currentServerId = serverId;
    state.chatMessages = []; state.channels = []; state.categories = [];
    if (window.serverRoles) serverRoles.subscribe(serverId);
    if (window.serverSettings) serverSettings.subscribe(serverId);
    if (window.serverPages) serverPages.subscribe(serverId);
    if (serverId) localStorage.setItem('zn_lastServer', serverId);
    else localStorage.removeItem('zn_lastServer');
    if (window.channelManager && serverId) {
      await new Promise(function(resolve) {
        var done = false;
        var finish = function() { if (done) return; done = true; if (!(state.channels || []).length) channelManager._setDefaults(); resolve(); };
        channelManager.loadChannels(serverId, finish);
        setTimeout(finish, 3000);
      });
    }
    var firstText = (state.channels || []).find(function(c) { return c.type === 'text'; });
    if (firstText && state.currentChannelId !== firstText.id) {
      state.currentChannelId = firstText.id; state.currentChannel = firstText;
      if (window.chat) chat.loadHistory(firstText.id);
    }
    ui.render.all();
  },
  _persistServers: function() { localStorage.setItem('zn_servers', JSON.stringify(state.servers)); },
  init: function() {
    serverManager.loadServers();
    var lastServer = localStorage.getItem('zn_lastServer');
    if (lastServer && state.servers.find(function(s) { return s.id === lastServer; })) serverManager.switchTo(lastServer);
    else if (state.servers.length) serverManager.switchTo(state.servers[0].id);
  },

  _getOrder: function() { try { return JSON.parse(localStorage.getItem('zn_serverOrder') || '[]'); } catch(e) { return []; } },
  _saveOrder: function(ids) { localStorage.setItem('zn_serverOrder', JSON.stringify(ids)); },

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

  renderList: function() {
    var container = document.getElementById('serverIcons');
    if (!container) return;
    var srvs = serverManager._sortedServers();
    var current = state.currentServerId;
    var currentServer = current && srvs.find(function(s) { return s.id === current; });
    var headerEl = document.getElementById('serverHeaderName');
    if (headerEl) headerEl.textContent = currentServer ? currentServer.name : 'Zellous';
    var colors = ['#5865f2', '#57f287', '#feb347', '#fe7168', '#9b59b6', '#1abc9c', '#e67e22', '#e74c3c'];
    var html = '';
    srvs.forEach(function(s) {
      var active = s.id === current ? ' active' : '';
      var color = s.iconColor || colors[s.name.length % colors.length];
      var initial = (s.name || '?')[0].toUpperCase();
      html += '<div class="server-icon' + active + '" draggable="true" data-server="' + s.id + '" title="' + s.name + '" style="background:' + (active ? '' : color) + '">' +
        '<div class="server-pill"></div>' + initial + '</div>';
    });
    html += '<div class="server-separator" id="serverSeparator"></div>' +
      '<div class="server-icon add-server" id="addServerBtn" title="Add a Server"><div class="server-pill"></div>+</div>';
    container.innerHTML = html;
    var homeIcon = document.getElementById('homeServer');
    if (homeIcon) {
      homeIcon.classList.toggle('active', !current);
      homeIcon.addEventListener('click', function() { serverManager.switchTo(null); });
    }
    container.querySelectorAll('[data-server]').forEach(function(el) {
      el.addEventListener('click', function() { serverManager.switchTo(el.dataset.server); });
      el.addEventListener('contextmenu', function(e) { e.preventDefault(); serverManager.showContextMenu(el.dataset.server, e.clientX, e.clientY); });
    });
    var addBtn = document.getElementById('addServerBtn');
    if (addBtn) addBtn.addEventListener('click', function() { serverManager.showCreateModal(); });
    serverManager._initDragDrop(container);
  },

  _initDragDrop: function(container) {
    var dragId = null;
    container.addEventListener('dragstart', function(e) {
      var el = e.target.closest('[data-server]');
      if (!el) return;
      dragId = el.dataset.server; e.dataTransfer.effectAllowed = 'move';
      setTimeout(function() { el.classList.add('dragging'); }, 0);
    });
    container.addEventListener('dragend', function() {
      container.querySelectorAll('.dragging').forEach(function(el) { el.classList.remove('dragging'); });
      container.querySelectorAll('.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
      dragId = null;
    });
    container.addEventListener('dragover', function(e) {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      var target = e.target.closest('[data-server]');
      container.querySelectorAll('.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
      if (target && target.dataset.server !== dragId) target.classList.add('drag-over');
    });
    container.addEventListener('drop', function(e) {
      e.preventDefault();
      var target = e.target.closest('[data-server]');
      if (!target || !dragId || target.dataset.server === dragId) return;
      var srvs = serverManager._sortedServers();
      var ids = srvs.map(function(s) { return s.id; });
      var fromIdx = ids.indexOf(dragId), toIdx = ids.indexOf(target.dataset.server);
      if (fromIdx === -1 || toIdx === -1) return;
      ids.splice(fromIdx, 1); ids.splice(toIdx, 0, dragId);
      serverManager._saveOrder(ids); serverManager.renderList();
    });
  }
};

window.__zellous.servers = serverManager;
window.serverManager = serverManager;
