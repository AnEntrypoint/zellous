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

    const C = sdk.C || {};
    function icon(name) { return C.Icon ? C.Icon(name, { size: 15 }) : h('span', { class: 'glyph' }, '#'); }

    function pill(opts) {
      const { active, glyph, iconName, label, count, onClick, onContext, danger } = opts;
      const mark = iconName ? icon(iconName) : h('span', { class: 'glyph' }, glyph || '#');
      return h('a', {
        href: '#',
        class: (active ? 'active' : '') + (danger ? ' danger' : ''),
        onclick: (e) => { e.preventDefault(); onClick && onClick(e); },
        oncontextmenu: onContext ? (e) => { e.preventDefault(); onContext(e); } : null
      },
        h('span', { class: 'glyph' }, mark),
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
          const iconName = c.type === 'forum' ? 'forum' : c.type === 'page' ? 'page' : c.type === 'announcement' ? 'megaphone' : 'hash';
          out.push(pill({
            active: isActive,
            iconName,
            label: c.name || c.id,
            count: c.unreadCount || null,
            onClick: () => { try { window.ui.actions.switchChannel(c); } catch (_) {} },
            onContext: (e) => { try { window.channelManager.showContextMenu(c.id, e.clientX, e.clientY); } catch (_) {} }
          }));
        }
      } else if (useFallback) {
        out.push(group('rooms'));
        out.push(h('div', { class: 'rail-empty' }, 'no channels yet'));
      }

      // Voice group
      const voice = sorted.filter(c => c.type === 'voice' || c.type === 'threaded');
      if (voice.length) {
        out.push(group('voice'));
        for (const c of voice) {
          const isActive = cur.id === c.id;
          const inVoice = state.voiceConnected && state.voiceChannelName === c.name;
          const voiceGlyph = inVoice ? '●' : (c.type === 'threaded' ? '◉' : null);
          out.push(pill({
            active: isActive,
            glyph: voiceGlyph,
            iconName: voiceGlyph ? null : 'speaker',
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
