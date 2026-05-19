(function () {
  const HOME_ID = '__home__';

  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !window.serverManager) {
      setTimeout(init, 30);
      return;
    }
    const host = document.getElementById('serverList');
    if (!host) return;

    const { applyDiff, C } = sdk;

    host.innerHTML = '';

    function view() {
      const list = state.servers || [];
      const current = state.homeMode ? HOME_ID : state.currentServerId;
      const items = [
        { id: HOME_ID, name: 'Zellous', icon: null, active: current === HOME_ID, badge: null }
      ].concat(list.map(s => ({
        id: s.id,
        name: s.name || '',
        icon: s.iconUrl || null,
        active: current === s.id,
        badge: s.unreadCount || null
      })));
      return C.ServerRail({
        servers: items,
        activeId: current,
        onSelect: (id) => {
          if (id === HOME_ID) {
            state.homeMode = true;
            state.currentServerId = null;
            if (window.ui && window.ui.render) {
              try { window.ui.render.all(); } catch (e) {}
            }
            return;
          }
          try {
            state.homeMode = false;
            serverManager.switchTo(id);
          } catch (e) { console.warn(e); }
        },
        onAdd: () => { try { serverManager.showCreateModal(); } catch (e) { console.warn(e); } }
      });
    }

    function render() { applyDiff(host, view()); }

    effect(() => {
      window.stateSignals.servers.value;
      window.stateSignals.currentServerId.value;
      render();
    });

    host.addEventListener('contextmenu', (e) => {
      const icon = e.target.closest('.cm-server-icon[data-id]');
      if (!icon) return;
      const sid = icon.getAttribute('data-id');
      if (sid === HOME_ID || !sid) return;
      e.preventDefault();
      serverManager.showContextMenu(sid, e.clientX, e.clientY);
    });

    serverManager.renderList = render;
  }
  init();
})();
