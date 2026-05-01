(function () {
  'use strict';

  const LS = { servers: 'zn_rail_servers', channels: 'zn_rail_channels' };
  const $ = (id) => document.getElementById(id);

  function ensureNode(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // -------- Collapsible rails --------
  const rail = (() => {
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

  // -------- Persistent voice strip --------
  const voiceStrip = (() => {
    const strip = ensureNode(`
      <div class="voice-strip" id="voiceStrip" role="region" aria-label="Voice connection status">
        <div class="vs-label">
          <span class="vs-channel" id="vsChannel">voice</span>
          <span class="vs-status" id="vsStatus">connected</span>
        </div>
        <button id="vsMute" title="Mute">🎤</button>
        <button id="vsDeafen" title="Deafen">🎧</button>
        <button id="vsLeave" class="danger" title="Leave voice">✕</button>
      </div>`);
    document.body.appendChild(strip);
    $('vsMute').addEventListener('click', () => $('voiceMicBtn')?.click() || $('micToggleBtn')?.click());
    $('vsDeafen').addEventListener('click', () => $('voiceDeafenBtn')?.click() || $('deafenToggleBtn')?.click());
    $('vsLeave').addEventListener('click', () => window.lk?.disconnect?.());

    const update = () => {
      const ss = window.stateSignals;
      if (!ss) return;
      const connected = !!ss.voiceConnected?.value;
      strip.classList.toggle('open', connected);
      const ch = ss.currentChannel?.value;
      $('vsChannel').textContent = ch?.name ? '🔊 ' + ch.name : '🔊 voice';
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

  // -------- SDK AppShell mount --------
  const sdkShell = (() => {
    const sdk = window.__sdk;
    if (!sdk) return null;
    const { h, applyDiff, C } = sdk;
    if (!C?.AppShell || !C?.Topbar) return null;

    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return null;

    const renderTopbar = () => {
      const ss = window.stateSignals;
      const chName = ss?.currentChannel?.value?.name || 'zellous';
      const chType = ss?.currentChannel?.value?.type;
      const icon = chType === 'voice' ? '🔊' : '#';
      return C.Topbar({ brand: 'zellous', leaf: icon + ' ' + chName, items: [] });
    };

    const topbarMount = document.createElement('div');
    topbarMount.id = 'sdkTopbarMount';
    mainContent.insertBefore(topbarMount, mainContent.firstChild);

    const render = () => applyDiff(topbarMount, renderTopbar());

    render();

    if (typeof window.__effect === 'function') {
      window.__effect(() => {
        window.stateSignals?.currentChannel?.value;
        render();
      });
    }

    return { render };
  })();

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
