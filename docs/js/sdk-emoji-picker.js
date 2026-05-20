(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.EmojiPicker) { setTimeout(init, 30); return; }
    const { applyDiff, C } = sdk;

    let host = document.getElementById('sdkEmojiPickerHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sdkEmojiPickerHost';
      document.body.appendChild(host);
    }

    let openState = false;
    let anchor = { x: 200, y: 200 };
    let onSelectCb = null;

    function close() {
      openState = false;
      onSelectCb = null;
      render();
    }

    function show(x, y, onSelect) {
      anchor = { x: x || 200, y: y || 200 };
      onSelectCb = typeof onSelect === 'function' ? onSelect : null;
      openState = true;
      render();
    }

    function view() {
      return C.EmojiPicker({
        open: openState,
        anchorX: anchor.x,
        anchorY: anchor.y,
        onSelect: (emoji) => {
          try { onSelectCb?.(emoji); } catch (_) {}
          close();
        },
        onClose: close
      });
    }

    function render() { applyDiff(host, view()); }

    window.__emojiPicker = { show, close };
    render();
  }
  init();
})();
