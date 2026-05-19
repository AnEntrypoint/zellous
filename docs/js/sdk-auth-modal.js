(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.AuthModal) { setTimeout(init, 30); return; }
    if (!window.stateSignals?.showAuthModal) { setTimeout(init, 30); return; }
    let host = document.getElementById('sdkAuthModalHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sdkAuthModalHost';
      document.body.appendChild(host);
    }
    const { applyDiff, C } = sdk;

    let mode = 'extension';
    let error = '';
    let busy = false;

    function close() {
      state.showAuthModal = false;
      error = '';
      busy = false;
      if (window.auth?.hideModal) try { window.auth.hideModal(); } catch {}
      render();
    }

    async function tryConnectExtension() {
      try {
        busy = true; error = ''; render();
        if (!window.nostr) throw new Error('No Nostr extension found');
        if (window.auth?.loginWithExtension) await window.auth.loginWithExtension();
        if (window.auth?._afterLogin) window.auth._afterLogin();
        close();
      } catch (e) { error = e?.message || String(e); busy = false; render(); }
    }

    function tryGenerate() {
      try {
        busy = true; error = ''; render();
        if (window.auth?.generateKey) window.auth.generateKey();
        if (window.auth?._afterLogin) window.auth._afterLogin();
        close();
      } catch (e) { error = e?.message || String(e); busy = false; render(); }
    }

    function tryImport(nsec) {
      try {
        busy = true; error = ''; render();
        if (!nsec) { error = 'Enter a key'; busy = false; render(); return; }
        const ok = window.auth?.importKey ? window.auth.importKey(nsec) : false;
        if (!ok) { error = 'Invalid key'; busy = false; render(); return; }
        if (window.auth?._afterLogin) window.auth._afterLogin();
        close();
      } catch (e) { error = e?.message || String(e); busy = false; render(); }
    }

    function view() {
      return C.AuthModal({
        mode,
        error,
        busy,
        open: !!state.showAuthModal,
        onModeChange: (m) => { mode = m; error = ''; render(); },
        onConnectExtension: tryConnectExtension,
        onGenerate: tryGenerate,
        onImport: tryImport,
        onClose: close
      });
    }

    function render() { applyDiff(host, view()); }

    effect(() => {
      window.stateSignals.showAuthModal?.value;
      render();
    });

    render();
  }
  init();
})();
