(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.CommandPalette) { setTimeout(init, 30); return; }
    const { applyDiff, C } = sdk;

    let host = document.getElementById('sdkCommandPaletteHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sdkCommandPaletteHost';
      document.body.appendChild(host);
    }

    let openState = false;
    let items = [];
    let onSelectCb = null;

    function close() {
      openState = false;
      onSelectCb = null;
      items = [];
      render();
    }

    function show(nextItems, onSelect) {
      items = Array.isArray(nextItems) ? nextItems : [];
      onSelectCb = typeof onSelect === 'function' ? onSelect : null;
      openState = true;
      render();
    }

    function view() {
      return C.CommandPalette({
        open: openState,
        items,
        onSelect: (item) => {
          try { onSelectCb?.(item); } catch (_) {}
          close();
        },
        onClose: close
      });
    }

    function render() { applyDiff(host, view()); }

    window.__commandPalette = { show, close };
    render();
  }
  init();
})();
