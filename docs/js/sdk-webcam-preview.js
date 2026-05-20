(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.WebcamPreview) { setTimeout(init, 30); return; }
    const host = document.getElementById('webcamPreview');
    if (!host) return;
    const { applyDiff, C } = sdk;
    host.dataset.sdkOwned = '1';
    host.innerHTML = '';

    function view() {
      return C.WebcamPreview({
        videoStream: window.stateSignals.webcamStream.value,
        resolution: window.stateSignals.webcamResolution.value,
        fps: window.stateSignals.webcamFps.value,
        enabled: window.stateSignals.webcamEnabled.value,
        resolutions: ['160x120', '320x240', '640x480', '1280x720'],
        fpsOptions: [5, 10, 15, 24, 30],
        onResolutionChange: (v) => { window.state.webcamResolution = v; },
        onFpsChange: (v) => { window.state.webcamFps = Number(v) || v; },
        onToggle: () => { try { window.webcam?.toggle?.(); } catch {} }
      });
    }

    function render() { applyDiff(host, view()); }

    effect(() => {
      window.stateSignals.webcamStream.value;
      window.stateSignals.webcamEnabled.value;
      window.stateSignals.webcamResolution.value;
      window.stateSignals.webcamFps.value;
      render();
    });
  }
  init();
})();
