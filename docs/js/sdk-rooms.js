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

      const textLike = sorted.filter(c => c.type !== 'voice' && c.type !== 'threaded');
      const servers = state.servers || [];
      const useFallback = !textLike.length && !servers.length;
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
      } else if (useFallback) {
        out.push(group('rooms'));
        const stub = [
          { id: 'general', name: 'general', count: 2 },
          { id: 'design', name: 'design', count: 4 },
          { id: 'releases', name: 'releases', count: 1 },
          { id: 'lore', name: 'lore', count: 0 }
        ];
        for (const c of stub) {
          out.push(pill({
            active: cur.id === c.id,
            glyph: '#',
            label: c.name,
            count: c.count,
            onClick: () => {
              try { state.currentChannel = { id: c.id, type: 'text', name: c.name }; } catch (_) {}
            }
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

      if (home || useFallback) {
        out.push(group('direct'));
        if (useFallback) {
          out.push(pill({ active: false, glyph: '·', label: 'jordan', onClick: () => {} }));
          out.push(pill({ active: false, glyph: '·', label: 'mai', onClick: () => {} }));
          out.push(pill({ active: false, glyph: '·', label: 'aicat', onClick: () => {} }));
        } else {
          const user = state.currentUser || (window.auth && window.auth.user) || {};
          let name = user.displayName || user.username || '';
          if (!name || /^npub1/.test(name)) name = 'you';
          else if (name.length > 16) name = name.slice(0, 14) + '…';
          out.push(pill({ active: false, glyph: '·', label: name, onClick: () => {} }));
        }
      }

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
