(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.VadMeter) { setTimeout(init, 30); return; }
    const host = document.getElementById('vadMeterContainer');
    if (!host) return;
    const { applyDiff, C } = sdk;
    host.dataset.sdkOwned = '1';
    host.innerHTML = '';

    function view() {
      return C.VadMeter({
        level: window.stateSignals.micRawLevel.value,
        threshold: window.stateSignals.vadThreshold.value,
        onThresholdChange: (v) => { window.state.vadThreshold = v; }
      });
    }

    function render() { applyDiff(host, view()); }

    effect(() => {
      window.stateSignals.micRawLevel.value;
      window.stateSignals.vadThreshold.value;
      render();
    });
  }
  init();
})();
