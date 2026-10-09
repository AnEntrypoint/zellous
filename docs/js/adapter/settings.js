export function buildSettings({ v, S, call, applyTheme, persistBool }) {
  return {
    snapshot: () => ({
      settingsOpen: v('settingsOpen', false),
      settingsAnchor: v('settingsAnchor', { x: 0, y: 0 }),
      settingsSections: [{
        title: 'Preferences',
        rows: [
          { label: 'Theme', kind: 'select', value: v('themePref', 'ink'), options: [{ value: 'ink', label: 'Dark' }, { value: 'light', label: 'Light' }], onChange: applyTheme },
          { label: 'Notifications', kind: 'toggle', value: v('notificationsEnabled', true), onChange: (val) => persistBool('notificationsEnabled', 'zellous-notifications', val) },
          { label: 'Message preview', kind: 'toggle', value: v('messagePreviewEnabled', true), onChange: (val) => persistBool('messagePreviewEnabled', 'zellous-message-preview', val) },
          { label: 'Sound', kind: 'toggle', value: v('soundEnabled', true), onChange: (val) => persistBool('soundEnabled', 'zellous-sound', val) },
        ],
      }, {
        title: 'Account',
        rows: [
          { label: (window.auth && window.auth.isLoggedIn && window.auth.isLoggedIn()) ? ('Signed in as ' + (window.auth.npubShort ? window.auth.npubShort() : '')) : 'Not signed in', kind: 'value', value: '' },
          (window.auth && window.auth.isLoggedIn && window.auth.isLoggedIn())
            ? { label: 'Display name', kind: 'button', onClick: () => { if (S.settingsOpen) S.settingsOpen.value = false; window.channelManager && window.channelManager.showProfileModal && window.channelManager.showProfileModal(); } }
            : null,
          { label: 'Switch or import identity', kind: 'button', onClick: () => { if (S.authMode) S.authMode.value = 'import'; if (S.authError) S.authError.value = ''; if (S.settingsOpen) S.settingsOpen.value = false; if (S.showAuthModal) S.showAuthModal.value = true; } },
          (window.auth && window.auth.isLoggedIn && window.auth.isLoggedIn() && window.auth.nsecEncode && window.auth.nsecEncode())
            ? { label: 'Back up key (nsec)', kind: 'button', onClick: () => window.channelManager && window.channelManager.showKeyBackupModal && window.channelManager.showKeyBackupModal() }
            : null,
          (window.auth && window.auth.isLoggedIn && window.auth.isLoggedIn())
            ? { label: 'Logout', kind: 'button', danger: true, onClick: () => { if (S.settingsOpen) S.settingsOpen.value = false; window.ui && window.ui.actions && window.ui.actions.logout && window.ui.actions.logout(); } }
            : null,
        ].filter(Boolean),
      }],
    }),
    actions: {
      openSettings: () => call(() => {
        const gear = document.querySelector('.cm-user-controls .cm-user-btn[aria-label="Settings"]');
        if (gear && S.settingsAnchor) {
          const r = gear.getBoundingClientRect();
          S.settingsAnchor.value = { x: Math.max(8, Math.min(r.right - 300, window.innerWidth - 308)), y: r.bottom + 8 };
        }
        return window.ui.actions.toggleSettings && window.ui.actions.toggleSettings();
      }),
    },
  };
}
