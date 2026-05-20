(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.h || !sdk.applyDiff || !window.channelManager) {
      setTimeout(init, 30);
      return;
    }
    const host = document.getElementById('zRoomList');
    if (!host) return;
    const { h, applyDiff } = sdk;
    host.innerHTML = '';

    function pill(opts) {
      const { active, glyph, label, count, onClick, onContext, danger } = opts;
      return h('a', {
        href: '#',
        class: (active ? 'active' : '') + (danger ? ' danger' : ''),
        onclick: (e) => { e.preventDefault(); onClick && onClick(e); },
        oncontextmenu: onContext ? (e) => { e.preventDefault(); onContext(e); } : null
      },
        h('span', { class: 'glyph' }, glyph || '#'),
        h('span', {}, label || ''),
        count != null ? h('span', { class: 'count' }, count > 99 ? '99+' : String(count)) : null
      );
    }

    function group(label) {
      return h('div', { class: 'group' }, label);
    }

    function buildRooms() {
      const cur = state.currentChannel || { id: 'general' };
      const channels = state.channels || [];
      const categories = state.categories || [];
      const sorted = [...channels].sort((a, b) => (a.position || 0) - (b.position || 0));
      const home = state.homeMode;

      const out = [];

      // Server group: list of joined servers + home
      const servers = state.servers || [];
      if (servers.length) {
        out.push(group('servers'));
        out.push(pill({
          active: home,
          glyph: '◆',
          label: 'home',
          onClick: () => {
            state.homeMode = true;
            state.currentServerId = null;
            try { window.ui && window.ui.render && window.ui.render.all && window.ui.render.all(); } catch (_) {}
          }
        }));
        for (const s of servers) {
          out.push(pill({
            active: !home && state.currentServerId === s.id,
            glyph: (s.name || '?').slice(0, 1).toUpperCase(),
            label: s.name || s.id,
            count: s.unreadCount || null,
            onClick: () => {
              try { state.homeMode = false; window.serverManager.switchTo(s.id); } catch (_) {}
            },
            onContext: (e) => {
              try { window.serverManager.showContextMenu(s.id, e.clientX, e.clientY); } catch (_) {}
            }
          }));
        }
      }

      // Rooms group: text + announcement + forum + page channels for current server
      if (!home && (sorted.length || categories.length)) {
        const textLike = sorted.filter(c => c.type !== 'voice' && c.type !== 'threaded');
        if (textLike.length) {
          out.push(group('rooms'));
          for (const c of textLike) {
            const isActive = cur.id === c.id;
            const glyph = c.type === 'forum' ? '◻' : c.type === 'page' ? '§' : c.type === 'announcement' ? '📣' : '#';
            out.push(pill({
              active: isActive,
              glyph,
              label: c.name || c.id,
              count: c.unreadCount || null,
              onClick: () => { try { window.ui.actions.switchChannel(c); } catch (_) {} },
              onContext: (e) => { try { window.channelManager.showContextMenu(c.id, e.clientX, e.clientY); } catch (_) {} }
            }));
          }
        }

        // Voice group
        const voice = sorted.filter(c => c.type === 'voice' || c.type === 'threaded');
        if (voice.length) {
          out.push(group('voice'));
          for (const c of voice) {
            const isActive = cur.id === c.id;
            const inVoice = state.voiceConnected && state.voiceChannelName === c.name;
            out.push(pill({
              active: isActive,
              glyph: inVoice ? '●' : (c.type === 'threaded' ? '◉' : '🔊'),
              label: c.name || c.id,
              onClick: () => { try { window.ui.actions.switchChannel(c); } catch (_) {} },
              onContext: (e) => { try { window.channelManager.showContextMenu(c.id, e.clientX, e.clientY); } catch (_) {} }
            }));
          }
        }
      }

      // Direct messages — synthetic self entry when in home
      if (home) {
        out.push(group('direct'));
        const user = state.currentUser || (window.auth && window.auth.user) || {};
        const name = user.displayName || user.username || 'you';
        out.push(pill({
          active: true,
          glyph: '·',
          label: name + ' (you)',
          onClick: () => {}
        }));
      }

      // User bar at bottom — name + mic/deafen/settings buttons
      const user = state.currentUser || (window.auth && window.auth.user) || {};
      const npub = state.nostrPubkey ? ((window.auth && window.auth.npubShort && window.auth.npubShort(state.nostrPubkey)) || (state.nostrPubkey || '').slice(0, 12) + '…') : '';
      const uname = user.displayName || user.username || (state.nostrPubkey ? 'connecting…' : 'sign in');
      out.push(h('div', { class: 'group', style: 'margin-top:auto' }, ''));
      out.push(h('div', { class: 'app-side-user', style: 'padding:8px 12px;border-top:1px solid var(--bg-2);font-size:13px;color:var(--fg-2);display:flex;align-items:center;gap:8px' },
        h('span', { class: 'glyph', style: 'color:var(--accent)' }, '·'),
        h('span', { style: 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, uname),
        h('button', {
          title: 'Settings',
          style: 'background:none;border:none;color:var(--fg-3);cursor:pointer;padding:4px',
          onclick: () => { try { window.openSettings && window.openSettings(); } catch (_) {} }
        }, '⚙')
      ));

      return out;
    }

    function render() { applyDiff(host, h('div', {}, ...buildRooms())); }

    effect(() => {
      window.stateSignals.channels.value;
      window.stateSignals.categories.value;
      window.stateSignals.currentChannel.value;
      window.stateSignals.currentServerId.value;
      window.stateSignals.servers.value;
      window.stateSignals.voiceConnected.value;
      window.stateSignals.voiceChannelName.value;
      window.stateSignals.currentUser.value;
      render();
    });
  }
  init();
})();
