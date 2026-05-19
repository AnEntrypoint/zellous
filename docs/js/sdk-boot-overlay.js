(function () {
  // Boot overlay consumer: mounts SDK BootOverlay alongside the inline
  // legacy #zellousBoot. We do not delete the legacy markup (per migration
  // spec); instead we drive a parallel host that hides when appReady.
  function init() {
    const sdk = window.__sdk;
    if (!sdk || !sdk.C || !sdk.C.BootOverlay) { setTimeout(init, 30); return; }
    const { applyDiff, C } = sdk;

    let host = document.getElementById('sdkBootOverlayHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sdkBootOverlayHost';
      document.body.appendChild(host);
    }

    let progress = 0;
    let phase = 'starting';
    let errored = false;
    let visible = !window.appReady;

    // Tap into existing __boot reporter so we observe the same signal stream.
    const boot = window.__boot;
    if (boot) {
      const origProgress = boot.progress;
      const origFail = boot.fail;
      const origDone = boot.done;
      boot.progress = function (p, label) {
        progress = p; if (label) phase = label;
        render();
        return origProgress && origProgress.apply(boot, arguments);
      };
      boot.fail = function (msg) {
        errored = true; phase = msg || 'boot failed';
        render();
        return origFail && origFail.apply(boot, arguments);
      };
      boot.done = function () {
        visible = false;
        render();
        return origDone && origDone.apply(boot, arguments);
      };
    }

    function render() {
      applyDiff(host, C.BootOverlay({
        progress,
        phase,
        errored,
        visible,
      }));
    }

    render();
  }
  init();
})();
