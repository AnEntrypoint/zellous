(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.PttButton) { setTimeout(init, 30); return; }
    const host = document.getElementById('pttBtn');
    if (!host) return;
    const { applyDiff, C } = sdk;
    host.dataset.sdkOwned = '1';
    host.innerHTML = '';

    function holdStart() {
      try { window.ptt?.start?.(); } catch {}
    }
    function holdEnd() {
      try { window.ptt?.stop?.(); } catch {}
    }
    function toggleMode() {
      try { window.vad?.toggle?.(); } catch {}
    }

    function view() {
      const mode = window.stateSignals.pttUiMode.value;
      const voiceMode = (window.__zellous?.voiceMode?.get?.(window.state?.currentChannel?.id)) || 'ptt';
      return C.PttButton({
        state: mode,
        mode: voiceMode,
        onHoldStart: holdStart,
        onHoldEnd: holdEnd,
        onClick: toggleMode,
        label: mode === 'vad' ? 'VAD Mode' : (mode === 'live' ? 'Recording...' : 'Hold to Talk')
      });
    }

    function render() { applyDiff(host, view()); }

    effect(() => {
      window.stateSignals.pttUiMode.value;
      window.stateSignals.pttHeld.value;
      window.stateSignals.isSpeaking.value;
      render();
    });
  }
  init();
})();
