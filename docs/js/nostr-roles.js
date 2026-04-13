var serverRoles = {
  _store: new Map(),
  _sub: null,

  _creatorOf(serverId) {
    return serverId ? serverId.split(':')[0] : null;
  },

  isOwner(serverId) {
    return !!state.nostrPubkey && serverRoles._creatorOf(serverId) === state.nostrPubkey;
  },

  isAdmin(serverId) {
    if (serverRoles.isOwner(serverId)) return true;
    var roles = serverRoles._store.get(serverId) || {};
    return !!(roles.admins || []).includes(state.nostrPubkey);
  },

  isMod(serverId) {
    if (serverRoles.isAdmin(serverId)) return true;
    var roles = serverRoles._store.get(serverId) || {};
    return !!(roles.mods || []).includes(state.nostrPubkey);
  },

  getRole(serverId, pubkey) {
    var creator = serverRoles._creatorOf(serverId);
    if (pubkey === creator) return 'owner';
    var roles = serverRoles._store.get(serverId) || {};
    if ((roles.admins || []).includes(pubkey)) return 'admin';
    if ((roles.mods || []).includes(pubkey)) return 'moderator';
    return 'member';
  },

  async setRole(serverId, targetPubkey, role) {
    if (!serverRoles.isOwner(serverId) && role === 'admin') throw new Error('Only owner can assign admin');
    if (!serverRoles.isAdmin(serverId)) throw new Error('Insufficient permissions');
    var existing = serverRoles._store.get(serverId) || { admins: [], mods: [] };
    var admins = (existing.admins || []).filter(function(p) { return p !== targetPubkey; });
    var mods = (existing.mods || []).filter(function(p) { return p !== targetPubkey; });
    if (role === 'admin') admins = admins.concat([targetPubkey]);
    else if (role === 'moderator') mods = mods.concat([targetPubkey]);
    var next = { admins: admins, mods: mods };
    serverRoles._store.set(serverId, next);
    var dTag = 'zellous-roles:' + serverId;
    var signed = await auth.sign({ kind: 30078, created_at: Math.floor(Date.now() / 1000), tags: [['d', dTag]], content: JSON.stringify(next) });
    await nostrNet.publish(signed);
  },

  subscribe(serverId) {
    if (serverRoles._sub) { nostrNet.unsubscribe(serverRoles._sub); serverRoles._sub = null; }
    if (!serverId) return;
    var creator = serverRoles._creatorOf(serverId);
    if (!creator) return;
    var dTag = 'zellous-roles:' + serverId;
    serverRoles._sub = 'roles-' + serverId;
    nostrNet.subscribe(serverRoles._sub,
      [{ kinds: [30078], authors: [creator], '#d': [dTag] }],
      function(event) {
        if (event.pubkey !== creator) return;
        try {
          var data = JSON.parse(event.content);
          serverRoles._store.set(serverId, { admins: data.admins || [], mods: data.mods || [] });
          if (window.uiMembers) uiMembers.render();
        } catch(e) {}
      },
      function() {}
    );
  }
};

window.__zellous.roles = serverRoles;
window.serverRoles = serverRoles;
if (!window.__debug) window.__debug = {};
Object.defineProperty(window.__debug, 'roles', { get: function() { return { store: Object.fromEntries(serverRoles._store), sub: serverRoles._sub }; }, configurable: true });
