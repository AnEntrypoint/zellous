(function () {
  'use strict';

  const LS = { servers: 'zn_rail_servers', channels: 'zn_rail_channels' };
  const $ = (id) => document.getElementById(id);

  (function wireCrumb() {
    const breadName = document.getElementById('zBreadName');
    const crumbServer = document.getElementById('zCrumbServer');
    const crumbChannel = document.getElementById('zCrumbChannel');
    const statServer = document.getElementById('zStatusServer');
    const statChannel = document.getElementById('zStatusChannel');
    const statMsgs = document.getElementById('zStatusMsgs');
    const statRooms = document.getElementById('zStatusRooms');
    if (!breadName && !crumbChannel) return;
    function tick() {
      try {
        const ch = window.stateSignals?.currentChannel?.value || { name: 'general' };
        const servers = window.stateSignals?.servers?.value || [];
        const sid = window.stateSignals?.currentServerId?.value;
        const home = window.state?.homeMode;
        const srv = home ? 'home' : (servers.find(s => s.id === sid)?.name || 'home');
        const msgCount = (window.stateSignals?.chatMessages?.value || []).length;
        if (breadName) breadName.textContent = ch.name || 'general';
        if (crumbServer) crumbServer.textContent = srv;
        if (crumbChannel) crumbChannel.textContent = ch.name || 'general';
        if (statServer) statServer.textContent = srv;
        if (statChannel) statChannel.textContent = '• ' + (ch.name || 'general');
        if (statMsgs) statMsgs.textContent = '• ' + msgCount + ' messages';
        if (statRooms) {
          const ch = (window.stateSignals?.channels?.value || []).filter(c => c.type !== 'voice' && c.type !== 'threaded');
          const n = ch.length || 4;
          statRooms.textContent = '• ' + n + ' rooms';
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

  // -------- Collapsible rails --------
  const rail = (() => {
    if (true) return null; // rail toggles disabled — app-side layout supersedes the legacy collapsible rails
    const sl = document.querySelector('.server-list');
    const cs = document.querySelector('.channel-sidebar');
    if (!sl || !cs) return null;

    const toggleSv = ensureNode('<button class="rail-toggle servers" id="railToggleServers" title="Toggle server rail">‹</button>');
    const toggleCh = ensureNode('<button class="rail-toggle channels" id="railToggleChannels" title="Toggle channel rail">‹</button>');
    document.body.appendChild(toggleSv);
    document.body.appendChild(toggleCh);

    const apply = () => {
      const s = localStorage.getItem(LS.servers) === '1';
      const c = localStorage.getItem(LS.channels) === '1';
      sl.classList.toggle('collapsed', s);
      cs.classList.toggle('collapsed', c);
      toggleSv.classList.toggle('collapsed', s);
      toggleCh.classList.toggle('collapsed', c);
      toggleSv.textContent = s ? '›' : '‹';
      toggleCh.textContent = c ? '›' : '‹';
    };

    toggleSv.addEventListener('click', () => {
      const cur = localStorage.getItem(LS.servers) === '1';
      localStorage.setItem(LS.servers, cur ? '0' : '1');
      apply();
    });
    toggleCh.addEventListener('click', () => {
      const cur = localStorage.getItem(LS.channels) === '1';
      localStorage.setItem(LS.channels, cur ? '0' : '1');
      apply();
    });

    apply();
    return { apply, toggleSv, toggleCh };
  })();

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
          const sym = c.type === 'voice' ? '🔊' : '#';
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
  const voiceStrip = (() => { if (true) return null;
    const strip = ensureNode(`
      <div class="voice-strip" id="voiceStrip" role="region" aria-label="Voice connection status">
        <div class="vs-label">
          <span class="vs-channel" id="vsChannel">voice</span>
          <span class="vs-status" id="vsStatus">connected</span>
        </div>
        <button id="vsMute" title="Mute"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 15 6.7 12H5c0 3.42 2.72 6.23 6 6.72V22h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg></button>
        <button id="vsDeafen" title="Deafen"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg></button>
        <button id="vsLeave" class="danger" title="Leave voice"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg></button>
      </div>`);
    const sidebar = document.querySelector('.channel-sidebar');
    const userPanel = sidebar?.querySelector('.user-panel');
    if (sidebar && userPanel) sidebar.insertBefore(strip, userPanel);
    else document.body.appendChild(strip);
    $('vsMute').addEventListener('click', () => $('voiceMicBtn')?.click() || $('micToggleBtn')?.click());
    $('vsDeafen').addEventListener('click', () => $('voiceDeafenBtn')?.click() || $('deafenToggleBtn')?.click());
    $('vsLeave').addEventListener('click', () => window.lk?.disconnect?.());

    const update = () => {
      const ss = window.stateSignals;
      if (!ss) return;
      const connected = !!ss.voiceConnected?.value;
      strip.classList.toggle('open', connected);
      document.querySelector('.channel-sidebar')?.classList.toggle('has-voice-strip', connected);
      const chName = ss.voiceChannelName?.value || ss.currentChannel?.value?.name || 'voice';
      $('vsChannel').textContent = chName;
      const cs = ss.voiceConnectionState?.value;
      $('vsStatus').textContent = cs || (connected ? 'connected' : 'idle');
    };

    if (typeof window.__effect === 'function') {
      window.__effect(() => {
        window.stateSignals?.voiceConnected?.value;
        window.stateSignals?.voiceConnectionState?.value;
        window.stateSignals?.currentChannel?.value;
        update();
      });
    }
    update();
    return { strip, update };
  })();

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
