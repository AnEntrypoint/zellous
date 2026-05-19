(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.MobileHeader) { setTimeout(init, 30); return; }
    const host = document.getElementById('mobileHeader');
    if (!host) return;

    const { applyDiff, C } = sdk;

    function render() {
      const ss = window.stateSignals;
      const ch = ss?.currentChannel?.value;
      const title = ch?.type === 'voice' ? '🔊 ' + (ch.name || '') : '# ' + (ch?.name || '');
      applyDiff(host, C.MobileHeader({
        title,
        onMenu: () => window.ui?.actions?.openMobileMenu?.(),
        onMembers: () => window.ui?.actions?.toggleMembers?.(),
      }));
    }

    effect(() => {
      window.stateSignals?.currentChannel?.value;
      render();
    });
  }
  init();
})();
