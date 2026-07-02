(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  (function wireCrumb() {
    const breadName = document.getElementById('zBreadName');
    const statServer = document.getElementById('zStatusServer');
    const statChannel = document.getElementById('zStatusChannel');
    const statMsgs = document.getElementById('zStatusMsgs');
    const statRooms = document.getElementById('zStatusRooms');
    if (!breadName && !statChannel) return;
    function tick() {
      try {
        const ch = window.stateSignals?.currentChannel?.value || { name: 'general' };
        const servers = window.stateSignals?.servers?.value || [];
        const sid = window.stateSignals?.currentServerId?.value;
        const home = window.state?.homeMode;
        const srv = home ? 'home' : (servers.find(s => s.id === sid)?.name || 'home');
        const msgCount = (window.stateSignals?.chatMessages?.value || []).length;
        if (breadName) breadName.textContent = ch.name || 'general';
        if (statServer) statServer.textContent = srv;
        if (statChannel) statChannel.textContent = ch.name || 'general';
        if (statMsgs) statMsgs.textContent = msgCount === 0 ? 'no messages' : (msgCount + (msgCount === 1 ? ' message' : ' messages'));
        if (statRooms) {
          const rooms = (window.stateSignals?.channels?.value || []).filter(c => c.type !== 'voice' && c.type !== 'threaded');
          const n = rooms.length;
          statRooms.textContent = n + (n === 1 ? ' room' : ' rooms');
        }
      } catch (_) {}
    }
    if (typeof window.__effect === 'function') {
      window.__effect(() => {
        window.stateSignals?.currentChannel?.value;
        window.stateSignals?.servers?.value;
        window.stateSignals?.currentServerId?.value;
        window.stateSignals?.chatMessages?.value;
        tick();
      });
    }
    tick();
  })();

  function ensureNode(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // -------- Collapsible rails (legacy; superseded by the app-side layout) --------
  const rail = null;

  // -------- Command palette --------
  // Superseded by the SDK's C.CommandPalette (window.__commandPalette, wired
  // in js/sdk-command-palette.js). This module used to hand-roll its own
  // `#commandPalette .cmdk-overlay` and its own Ctrl/Cmd+K listener, which
  // raced the SDK overlay for the same shortcut and always won (leaving the
  // real C.CommandPalette permanently empty). Removed; see AGENTS.md.
  const palette = null;

  // -------- Persistent voice strip (SDK-mounted by sdk-voice-strip.js) --------
  const voiceStrip = null;

  // -------- SDK AppShell mount — disabled; canonical .app-topbar in index.html drives the topbar --------
  const sdkShell = null;

  // Register on __shell directly; also wrap __debug after appReady so
  // the inline module bootstrap (which redefines __debug after parallel
  // script load) doesn't clobber us.
  window.__shell = { palette, rail, voiceStrip, sdkShell };

  const wrapDebug = () => {
    const prev = Object.getOwnPropertyDescriptor(window, '__debug');
    if (!prev || !prev.get) return false;
    Object.defineProperty(window, '__debug', {
      configurable: true,
      get() {
        const base = prev.get.call(window) || {};
        return Object.assign({}, base, { shell: window.__shell });
      },
    });
    return true;
  };

  const tryWrap = () => {
    if (wrapDebug()) return;
    if (window.appReady) { setTimeout(wrapDebug, 50); return; }
    setTimeout(tryWrap, 80);
  };
  tryWrap();
})();
