(function () {
  // Body-mounted SDK ContextMenu host. Exposes
  // window.__contextMenu = { show(items, x, y), close() }
  // for future migration of _mkMenu/showContextMenu call-sites. Existing
  // imperative callers (nostr-servers-ui, nostr-channels-ui, ui-chat) are
  // NOT refactored in this turn — they continue to work in parallel.
  function init() {
    const sdk = window.__sdk;
    if (!sdk || !sdk.C || !sdk.C.ContextMenu) { setTimeout(init, 30); return; }
    const { applyDiff, C } = sdk;

    let host = document.getElementById('sdkContextMenuHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sdkContextMenuHost';
      document.body.appendChild(host);
    }

    let state = { open: false, x: 0, y: 0, items: [] };

    function render() {
      applyDiff(host, C.ContextMenu({
        open: state.open,
        x: state.x,
        y: state.y,
        items: state.items,
        onClose: close,
      }));
    }

    function show(items, x, y) {
      state = { open: true, x: x | 0, y: y | 0, items: Array.isArray(items) ? items : [] };
      render();
      const off = (e) => {
        if (!host.contains(e.target)) { close(); document.removeEventListener('click', off, true); }
      };
      setTimeout(() => document.addEventListener('click', off, true), 0);
    }
    function close() {
      if (!state.open) return;
      state = { ...state, open: false };
      render();
    }

    window.__contextMenu = { show, close };
    render();
  }
  init();
})();
