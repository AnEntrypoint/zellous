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
      setGamePref: (key, val) => call(() => {
        const p = PREFS.find((x) => x.key === key);
        if (p) persistBool(key, p.store, val);
      }),
    },
  };
}
