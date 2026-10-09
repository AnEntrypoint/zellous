const PAGE_CHANNEL_POSITION_BASE = 1000;

export function buildRail({ v, S, call }) {
  const pageChannels = () => {
    const sid = v('currentServerId', null);
    if (!window.serverPages || !sid) return [];
    return (window.serverPages.getPages(sid) || []).map((p, i) => ({
      id: 'page:' + p.slug, name: p.title || p.slug, type: 'page',
      position: PAGE_CHANNEL_POSITION_BASE + i,
      _serverId: sid, _slug: p.slug, updatedAt: p.updatedAt,
    }));
  };

  return {
    snapshot(f) {
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
      openMobileMenu: () => call(() => {
        if (v('mobileMenuOpen', false)) window.ui.actions.closeMobileMenu();
        else window.ui.actions.openMobileMenu();
      }),
      closeMobileMenu: () => call(() => window.ui.actions.closeMobileMenu && window.ui.actions.closeMobileMenu()),
      goHome: () => call(() => {
        if (S.mobileMenuOpen) S.mobileMenuOpen.value = false;
        window.state.homeMode = true;
        window.state.currentServerId = null;
        window.state.currentChannelId = null;
        window.state.currentChannel = null;
        window.state.channels = [];
        window.state.categories = [];
        window.state.chatMessages = [];
        if (window.chat) window.chat.messages = [];
      }),
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
