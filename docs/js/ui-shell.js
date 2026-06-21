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
  const palette = (() => {
    const overlay = ensureNode(`
      <div class="cmdk-overlay" id="commandPalette" role="dialog" aria-label="Command palette" aria-hidden="true">
        <div class="cmdk-box">
          <input class="cmdk-input" id="cmdkInput" placeholder="Search channels, servers, actions…" autocomplete="off" spellcheck="false" />
          <div class="cmdk-list" id="cmdkList"></div>
        </div>
      </div>`);
    document.body.appendChild(overlay);
    const input = $('cmdkInput');
    const list = $('cmdkList');
    let active = 0;
    let items = [];

    const collect = () => {
      const out = [];
      const sm = window.serverManager;
      const cm = window.channelManager;
      const st = window.state;
      try {
        const servers = (window.stateSignals?.servers?.value) || [];
        for (const s of servers) {
          out.push({ kind: 'server', label: s.name || s.id || 'server', sub: '', run: () => sm?.switchServer?.(s.id) });
        }
        const channels = (window.stateSignals?.channels?.value) || [];
        for (const c of channels) {
          const sym = c.type === 'voice' ? 'voice' : '#';
          out.push({ kind: 'channel', label: sym + ' ' + (c.name || c.id), sub: '', run: () => window.ui?.actions?.switchChannel?.(c.id) });
        }
      } catch (e) { }
      out.push({ kind: 'action', label: 'Toggle theme', run: () => $('themeToggleBtn')?.click() });
      out.push({ kind: 'action', label: 'Toggle mute', run: () => $('micToggleBtn')?.click() || $('voiceMicBtn')?.click() });
      out.push({ kind: 'action', label: 'Toggle deafen', run: () => $('deafenToggleBtn')?.click() || $('voiceDeafenBtn')?.click() });
      out.push({ kind: 'action', label: 'Open settings', run: () => $('settingsBtn')?.click() });
      out.push({ kind: 'action', label: 'Toggle members', run: () => window.ui?.actions?.toggleMembers?.() });
      out.push({ kind: 'action', label: 'Disconnect voice', run: () => window.lk?.disconnect?.() });
      return out;
    };

    const render = () => {
      const q = input.value.trim().toLowerCase();
      const all = collect();
      items = q ? all.filter(i => i.label.toLowerCase().includes(q)) : all;
      if (active >= items.length) active = 0;
      list.innerHTML = '';
      if (!items.length) {
        list.innerHTML = '<div class="cmdk-empty">no matches</div>';
        return;
      }
      items.forEach((it, i) => {
        const row = document.createElement('div');
        row.className = 'cmdk-item' + (i === active ? ' active' : '');
        row.innerHTML = `<span class="cmdk-kind">${it.kind}</span><span>${it.label}</span>`;
        row.addEventListener('click', () => { run(i); });
        row.addEventListener('mouseenter', () => { active = i; render(); });
        list.appendChild(row);
      });
    };

    const open = () => {
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      input.value = '';
      active = 0;
      render();
      setTimeout(() => input.focus(), 10);
    };
    const close = () => {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      input.blur();
    };
    const run = (i) => {
      const it = items[i];
      if (!it) return;
      close();
      try { it.run?.(); } catch (e) { console.error('palette run', e); }
    };

    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(active); }
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (overlay.classList.contains('open')) close(); else open();
      }
    });

    return { open, close, render, isOpen: () => overlay.classList.contains('open') };
  })();

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
