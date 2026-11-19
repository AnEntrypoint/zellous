const PREFS = [
  { key: 'notificationsEnabled', store: 'zellous-notifications', label: 'Notifications' },
  { key: 'messagePreviewEnabled', store: 'zellous-message-preview', label: 'Message preview' },
  { key: 'soundEnabled', store: 'zellous-sound', label: 'Sound' },
];

export function buildGame({ v, S, call, persistBool }) {
  return {
    snapshot: () => {
      const counts = (window.nostrUnread && window.nostrUnread.countsFor) ? window.nostrUnread.countsFor() : {};
      return {
        unreadTotal: Object.values(counts).reduce((n, c) => n + (c || 0), 0),
        gamePrefOpen: v('gamePrefOpen', false),
        gamePrefToggles: PREFS.map((p) => ({ key: p.key, label: p.label, checked: !!v(p.key, true) })),
        gameServerCreateOpen: v('gameServerCreateOpen', false),
        serverColors: Array.isArray(window.AVATAR_COLORS) ? window.AVATAR_COLORS : [],
      };
    },
    actions: {
      markAllRead: () => call(() => {
        const u = window.nostrUnread;
        if (!u || !u.countsFor || !u.markRead) return;
        Object.keys(u.countsFor()).forEach((id) => u.markRead(id));
      }),
      openGamePrefs: () => call(() => { if (S.gamePrefOpen) S.gamePrefOpen.value = true; }),
      closeGamePrefs: () => call(() => { if (S.gamePrefOpen) S.gamePrefOpen.value = false; }),
      openServerCreate: () => call(() => { if (S.gameServerCreateOpen) S.gameServerCreateOpen.value = true; }),
      closeServerCreate: () => call(() => { if (S.gameServerCreateOpen) S.gameServerCreateOpen.value = false; }),
      createServer: (name, color) => call(async () => {
        if (!window.serverManager || !window.serverManager.create) return;
        try {
          await window.serverManager.create(name, color);
          if (S.gameServerCreateOpen) S.gameServerCreateOpen.value = false;
        } catch (e) {
          if (window.ui && window.ui.showToast) window.ui.showToast('Create server failed: ' + ((e && e.message) || 'unknown'), 3000, 'error');
        }
      }),
      setGamePref: (key, val) => call(() => {
        const p = PREFS.find((x) => x.key === key);
        if (p) persistBool(key, p.store, val);
      }),
    },
  };
}
