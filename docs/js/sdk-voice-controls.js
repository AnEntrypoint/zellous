(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.VoiceControls) {
      setTimeout(init, 30);
      return;
    }
    const host = document.getElementById('voiceControlsBar');
    if (!host) return;
    if (!window.lk) { setTimeout(init, 30); return; }

    const { applyDiff, C } = sdk;
    host.innerHTML = '';

    function view() {
      return C.VoiceControls({
        muted: !!state.micMuted,
        deafened: !!state.voiceDeafened,
        cameraOn: !!state.webcamEnabled,
        screenShareOn: false,
        onMic: () => {
          if (window.lk?.toggleMic) window.lk.toggleMic();
          else state.micMuted = !state.micMuted;
        },
        onDeafen: () => {
          if (window.lk?.toggleDeafen) window.lk.toggleDeafen();
          else state.voiceDeafened = !state.voiceDeafened;
        },
        onCamera: () => {
          if (window.webcam?.toggle) window.webcam.toggle();
        },
        onScreenShare: null,
        onSettings: () => {
          if (typeof window.openSettings === 'function') window.openSettings();
          else document.getElementById('voiceSettingsBtn')?.click();
        },
        onLeave: () => {
          if (window.wireweave?.voice?.leave) return window.wireweave.voice.leave();
          if (window.voice?.leave) return window.voice.leave();
          if (window.lk?.disconnect) return window.lk.disconnect();
        }
      });
    }

    function render() { applyDiff(host, view()); }

    effect(() => {
      window.stateSignals.micMuted.value;
      window.stateSignals.voiceDeafened.value;
      window.stateSignals.webcamEnabled.value;
      render();
    });
  }
  init();
})();
