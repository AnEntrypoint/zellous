var DEFAULT_CATEGORIES = [
  { id: 'general', name: 'TEXT CHANNELS', position: 0 },
  { id: 'voice', name: 'VOICE CHANNELS', position: 1 }
];

var DEFAULT_CHANNELS = [
  { id: 'general', name: 'general', type: 'text', categoryId: 'general', position: 0 },
  { id: 'announcements', name: 'announcements', type: 'announcement', categoryId: 'general', position: 1 },
  { id: 'general-voice', name: 'General', type: 'voice', categoryId: 'voice', position: 0 }
];

async function _hexChannelId(channelId, serverId) {
  var input = (serverId || '') + ':' + channelId;
  var buf = new TextEncoder().encode(input);
  var hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

var channelManager = {
  isOwner: function() {
    return state.nostrPubkey && state.currentServerId && state.nostrPubkey === state.currentServerId.split(':')[0];
  },

  loadChannels: function(serverId, onReady) {
    var parts = serverId.split(':');
    var ownerPubkey = parts[0];
    var dTag = 'zellous-channels:' + serverId;
    nostrNet.subscribe(
      'channels-' + serverId,
      [{ kinds: [30078], authors: [ownerPubkey], '#d': [dTag] }],
      function(event) {
        var hasTag = event.tags && event.tags.some(function(t) { return t[0] === 'd' && t[1] === dTag; });
        if (!hasTag) return;
        try {
          var data = JSON.parse(event.content);
          state.channels = data.channels || [];
          state.categories = data.categories || [];
          ui.render.all();
        } catch (e) { console.warn('[nostr-channels] parse error:', e.message); }
      },
      function() {
        if (!state.channels.length) channelManager._setDefaults();
        if (onReady) onReady();
      }
    );
  },

  _setDefaults: function() {
    state.channels = DEFAULT_CHANNELS.map(function(c) { return Object.assign({}, c); });
    state.categories = DEFAULT_CATEGORIES.map(function(c) { return Object.assign({}, c); });
    ui.render.all();
    if (channelManager.isOwner()) channelManager._publishChannelList();
  },

  _publishChannelList: async function() {
    if (!channelManager.isOwner()) return;
    var serverId = state.currentServerId;
    var template = {
      kind: 30078,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['d', 'zellous-channels:' + serverId]],
      content: JSON.stringify({ channels: state.channels, categories: state.categories })
    };
    var signed = await auth.sign(template);
    await nostrNet.publish(signed);
  },

  create: async function(name, type, categoryId) {
    var id = 'ch-' + Date.now();
    state.channels = state.channels.concat([{
      id: id, name: name, type: type || 'text',
      categoryId: categoryId || 'general', position: state.channels.length
    }]);
    await channelManager._publishChannelList();
    ui.render.all();
  },

  rename: async function(id, name) {
    state.channels = state.channels.map(function(c) {
      return c.id === id ? Object.assign({}, c, { name: name }) : c;
    });
    await channelManager._publishChannelList();
    ui.render.all();
  },

  remove: async function(id) {
    state.channels = state.channels.filter(function(c) { return c.id !== id; });
    await channelManager._publishChannelList();
    ui.render.all();
  },

  createCategory: async function(name) {
    var id = 'cat-' + Date.now();
    state.categories = state.categories.concat([{ id: id, name: name, position: state.categories.length }]);
    await channelManager._publishChannelList();
    ui.render.all();
  },

  renameCategory: async function(id, name) {
    state.categories = state.categories.map(function(c) {
      return c.id === id ? Object.assign({}, c, { name: name }) : c;
    });
    await channelManager._publishChannelList();
    ui.render.all();
  },

  deleteCategory: async function(id) {
    state.categories = state.categories.filter(function(c) { return c.id !== id; });
    state.channels = state.channels.map(function(c) {
      return c.categoryId === id ? Object.assign({}, c, { categoryId: null }) : c;
    });
    await channelManager._publishChannelList();
    ui.render.all();
  },

  reorderChannels: async function(catId, ids) {
    ids.forEach(function(chId, idx) {
      state.channels = state.channels.map(function(c) {
        return c.id === chId ? Object.assign({}, c, { position: idx, categoryId: catId }) : c;
      });
    });
    await channelManager._publishChannelList();
    ui.render.all();
  },

  reorderCategories: async function(ids) {
    ids.forEach(function(catId, idx) {
      state.categories = state.categories.map(function(c) {
        return c.id === catId ? Object.assign({}, c, { position: idx }) : c;
      });
    });
    await channelManager._publishChannelList();
    ui.render.all();
  },

  hideContextMenu: function() {
    var m = document.getElementById('channelContextMenu');
    if (m) m.remove();
    var cm = document.getElementById('categoryContextMenu');
    if (cm) cm.remove();
  }
};

window.channelManager = channelManager;
