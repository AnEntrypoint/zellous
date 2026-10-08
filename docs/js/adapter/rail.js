// Rail (servers + channel groups) and the mobile drawer that holds it.
export function buildRail({ v, S, call }) {
  // Without a position these sort ahead of every real channel, which
  // pins the page list above general/announcements in the rail.
  const pageChannels = () => {
    const sid = v('currentServerId', null);
    if (!window.serverPages || !sid) return [];
    return (window.serverPages.getPages(sid) || []).map((p, i) => ({
      id: 'page:' + p.slug, name: p.title || p.slug, type: 'page',
      position: 1000 + i,
      _serverId: sid, _slug: p.slug, updatedAt: p.updatedAt,
    }));
  };

  return {
    snapshot(f) {
      // The rail's badge needs a per-channel count, and wireweave's unread
      // tracker keys by channel id only, so a server's badge is the sum over
      // the channels this client knows belong to it.
      const unreadCounts = f.unreadCounts;
      const withUnread = (list) => list.map((c) => ({ ...c, unreadCount: unreadCounts[c.id] || 0 }));
      return {
        channels: f.dm ? [] : withUnread([...v('channels', []), ...pageChannels()]),
        categories: v('categories', []),
        servers: v('servers', []).map((sv) => ({ ...sv, unreadCount: sv.id === f.sid ? (v('channels', []) || []).reduce((n, c) => n + (unreadCounts[c.id] || 0), 0) : 0 })),
        currentChannel: f.curr,
        currentServerId: f.sid,
        canManage: f.canManage,
        homeMode: (window.state && window.state.homeMode) || false,
        mobileMenuOpen: v('mobileMenuOpen', false),
      };
    },
    actions: {
      switchChannel: (ch) => call(() => {
        if (S.mobileMenuOpen) S.mobileMenuOpen.value = false;
        window.ui.actions.switchChannel(ch);
      }),
      // The hamburger is the drawer's own toggle: tapping it while the drawer
      // is open has to close it, or the only way out is tapping the main area
      // or picking a channel.
      openMobileMenu: () => call(() => {
        if (v('mobileMenuOpen', false)) window.ui.actions.closeMobileMenu();
        else window.ui.actions.openMobileMenu();
      }),
      closeMobileMenu: () => call(() => window.ui.actions.closeMobileMenu && window.ui.actions.closeMobileMenu()),
      goHome: () => call(() => {
        if (S.mobileMenuOpen) S.mobileMenuOpen.value = false;
        // homeMode only drives the sidebar's active-highlight in the SDK
        // (community-app.js line ~121) -- it does NOT clear the rendered
        // channel list or chat body on its own. Without also resetting these,
        // switching to "home" left the PREVIOUS server's rooms/messages fully
        // visible: only the highlighted rail item and status-bar label
        // changed, matching the exact reported bug. serverManager.switchTo
        // already resets this same state when switching to a real server;
        // goHome needs the same reset since there is no dedicated "home"
        // content surface to switch into.
        window.state.homeMode = true;
        window.state.currentServerId = null;
        window.state.currentChannelId = null;
        window.state.currentChannel = null;
        window.state.channels = [];
        window.state.categories = [];
        window.state.chatMessages = [];
        if (window.chat) window.chat.messages = [];
      }),
      // The SDK's real "servers" nav link (community-app.js) already calls
      // this directly with e.preventDefault() -- there is no separate
      // "servers browser" surface to open, so this toggles the same
      // home/server view goHome()/switchServer() already drive. The legacy
      // #zServersBtn anchor this used to click had no listener of its own
      // (a real dead link, `href="#"` with zero JS behind it) -- removed
      // rather than routed through, since there was nothing there to reach.
      openServers: () => call(() => {
        if (S.mobileMenuOpen) S.mobileMenuOpen.value = false;
        if (window.state.homeMode) {
          const first = (window.state.servers || [])[0];
          if (first) { window.state.homeMode = false; window.serverManager.switchTo(first.id); }
        } else {
          window.state.homeMode = true; window.state.currentServerId = null;
        }
      }),
      switchServer: (id) => call(() => {
        if (S.mobileMenuOpen) S.mobileMenuOpen.value = false;
        window.state.homeMode = false; window.serverManager.switchTo(id);
      }),
      createOrJoinServer: () => call(() => window.serverManager.showCreateOrJoinModal()),
      channelContext: (id, x, y) => call(() => window.channelManager.showContextMenu(id, x, y)),
      createChannel: () => call(() => window.channelManager.showCreateModal(null, null)),
      // The SDK rail owns channel rendering (and therefore the drag/keydown
      // handlers), so the ordering math lives here: `dir` is -1/1 from the
      // keyboard, a channel id from a drop, and either way the full sibling
      // list of the destination category is republished -- wireweave's
      // ch.reorder(catId, ids) assigns position AND categoryId from that list,
      // which is what makes a cross-category drop land in the target category.
      reorderChannel: (id, arg) => call(() => {
        const channels = window.state.channels || [];
        if (!channels.some((c) => c.id === id)) return;
        const siblings = (cat) => channels.filter((c) => (c.categoryId || null) === (cat || null)).sort((a, b) => (a.position || 0) - (b.position || 0)).map((c) => c.id);
        let cat = (channels.find((c) => c.id === id) || {}).categoryId || null;
        let ids;
        if (typeof arg === 'number') {
          ids = siblings(cat);
          const from = ids.indexOf(id), to = from + arg;
          if (from === -1 || to < 0 || to >= ids.length) return;
          ids.splice(from, 1); ids.splice(to, 0, id);
        } else {
          const target = channels.find((c) => c.id === arg);
          if (!target || arg === id) return;
          cat = target.categoryId || null;
          ids = siblings(cat).filter((cid) => cid !== id);
          ids.splice(ids.indexOf(arg), 0, id);
        }
        return window.channelManager.reorderChannels(cat, ids);
      }, 'Reorder'),
      serverContext: (id, x, y) => call(() => window.serverManager.showContextMenu(id, x, y)),
    },
  };
}
