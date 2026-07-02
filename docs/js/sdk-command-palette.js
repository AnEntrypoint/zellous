// Wires Ctrl/Cmd+K to the SDK's C.CommandPalette (window.__commandPalette,
// set by nostr-adapter.js once mountCommunityApp resolves). The SDK component
// is a pure imperative surface: show(items, onSelect) / close(); it renders
// whatever items it is given each time it is opened — nothing auto-populates
// it, so this module builds the real command list from live state on every
// open and re-opens with a fresh list on each keystroke (like ui-shell's
// removed hand-rolled version did, but driving the real SDK overlay).
(function () {
  function init() {
    if (!window.__commandPalette || !window.stateSignals) { setTimeout(init, 30); return; }
    const commands = () => {
      const out = [];
      const S = window.stateSignals;
      const servers = (S.servers && S.servers.value) || [];
      for (const s of servers) {
        out.push({ id: 'server:' + s.id, label: s.name || s.id || 'server', kind: 'server', onSelect: () => window.serverManager && window.serverManager.switchTo && window.serverManager.switchTo(s.id) });
      }
      const channels = (S.channels && S.channels.value) || [];
      for (const c of channels) {
        out.push({ id: 'channel:' + c.id, label: (c.type === 'voice' ? 'voice ' : '# ') + (c.name || c.id), kind: 'channel', onSelect: () => window.ui && window.ui.actions && window.ui.actions.switchChannel && window.ui.actions.switchChannel(c) });
      }
      out.push({
        id: 'mute', label: '/mute — toggle microphone mute', kind: 'action',
        onSelect: () => { if (window.lk && window.lk.toggleMic) window.lk.toggleMic(); else if (window.state) window.state.micMuted = !window.state.micMuted; },
      });
      out.push({
        id: 'settings', label: '/settings — open settings', kind: 'action',
        onSelect: () => { if (window.ui && window.ui.actions && window.ui.actions.toggleSettings) window.ui.actions.toggleSettings(); },
      });
      out.push({
        id: 'help', label: '/help — keyboard shortcuts & commands', kind: 'action',
        onSelect: () => {
          if (window.ui && window.ui.showToast) {
            window.ui.showToast('Shortcuts: Ctrl/Cmd+K command palette · /mute /settings /help /invite', 5000);
          }
        },
      });
      out.push({
        id: 'invite', label: '/invite — copy invite link', kind: 'action',
        onSelect: () => {
          const serverId = (S.currentServerId && S.currentServerId.value) || (window.state && window.state.currentServerId);
          if (!serverId) { if (window.ui && window.ui.showToast) window.ui.showToast('No server selected to invite to', 3000, 'error'); return; }
          const url = location.origin + location.pathname + '?room=' + encodeURIComponent(serverId);
          const done = () => { if (window.ui && window.ui.showToast) window.ui.showToast('Invite link copied!'); };
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done).catch(() => {
              const el = document.createElement('textarea');
              el.value = url; document.body.appendChild(el); el.select();
              document.execCommand('copy'); el.remove(); done();
            });
          } else {
            const el = document.createElement('textarea');
            el.value = url; document.body.appendChild(el); el.select();
            document.execCommand('copy'); el.remove(); done();
          }
        },
      });
      return out;
    };

    const open = () => { window.__commandPalette.show(commands(), (item) => { try { item && item.onSelect && item.onSelect(); } catch (e) { console.error('command palette run', e); } }); };

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    });

    window.__paletteCommands = { list: commands, open };
  }
  init();
})();
