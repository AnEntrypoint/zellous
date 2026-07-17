(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

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

  // -------- SDK AppShell mount — disabled; mountCommunityApp renders its own .app-topbar --------
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
