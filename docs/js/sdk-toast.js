(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.Toast) { setTimeout(init, 30); return; }
    if (!window.stateSignals?.toastQueue) { setTimeout(init, 30); return; }

    const { applyDiff, C } = sdk;
    let host = document.getElementById('toastHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toastHost';
      host.style.cssText = 'position:fixed;bottom:calc(80px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:9999;pointer-events:none';
      document.body.appendChild(host);
    }

    const timers = new Map();

    function dismiss(id) {
      const t = timers.get(id);
      if (t) { clearTimeout(t); timers.delete(id); }
      const q = window.stateSignals.toastQueue.value || [];
      window.stateSignals.toastQueue.value = q.filter(e => e.id !== id);
    }

    function view() {
      const q = window.stateSignals.toastQueue.value || [];
      const top = q[0];
      if (!top) return C.Toast({ message: '', tone: 'info', visible: false });
      if (!timers.has(top.id)) {
        timers.set(top.id, setTimeout(() => dismiss(top.id), top.duration || 2000));
      }
      return C.Toast({
        message: top.message,
        tone: top.tone || 'info',
        visible: true,
        onDismiss: () => dismiss(top.id),
      });
    }

    function render() { applyDiff(host, view()); }

    effect(() => {
      window.stateSignals.toastQueue.value;
      render();
    });
  }
  init();
})();
