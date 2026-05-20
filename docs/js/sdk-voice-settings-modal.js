(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.VoiceSettingsModal) { setTimeout(init, 30); return; }
    if (!window.stateSignals?.voiceSettingsOpen) { setTimeout(init, 30); return; }
    const { applyDiff, C } = sdk;

    let host = document.getElementById('voiceSettingsModalHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'voiceSettingsModalHost';
      document.body.appendChild(host);
    }

    let devicesLoaded = false;
    async function loadDevices() {
      if (devicesLoaded) return;
      devicesLoaded = true;
      try {
        try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
          s.getTracks().forEach(t => t.stop());
        } catch (_) {}
        const devs = await navigator.mediaDevices.enumerateDevices();
        state.inputDevices = devs.filter(d => d.kind === 'audioinput').map(d => ({ deviceId: d.deviceId, label: d.label || 'Microphone' }));
        state.outputDevices = devs.filter(d => d.kind === 'audiooutput').map(d => ({ deviceId: d.deviceId, label: d.label || 'Speakers' }));
      } catch (_) { devicesLoaded = false; }
    }

    window.openVoiceSettings = function () {
      state.voiceSettingsOpen = true;
      loadDevices();
    };

    function persist() {
      try {
        localStorage.setItem('rnnoise', state.rnnoiseEnabled ? '1' : '0');
        localStorage.setItem('autoGain', state.autoGainEnabled ? '1' : '0');
        localStorage.setItem('forceRelay', state.forceTurnEnabled ? '1' : '0');
        localStorage.setItem('voiceBitrate', String(state.voiceBitrate || 64));
        if (state.inputDeviceId) localStorage.setItem('preferredInputDevice', state.inputDeviceId);
        if (state.outputDeviceId) localStorage.setItem('preferredOutputDevice', state.outputDeviceId);
      } catch (_) {}
    }

    function view() {
      const open = !!state.voiceSettingsOpen;
      const inputDevices = state.inputDevices || [];
      const outputDevices = state.outputDevices || [];
      return C.VoiceSettingsModal({
        open,
        mode: state.voiceMode || 'ptt',
        inputId: state.inputDeviceId,
        outputId: state.outputDeviceId,
        inputDevices: inputDevices.map(d => ({ value: d.deviceId, label: d.label })),
        outputDevices: outputDevices.map(d => ({ value: d.deviceId, label: d.label })),
        vadThreshold: state.vadThreshold,
        rnnoise: !!state.rnnoiseEnabled,
        autoGain: !!state.autoGainEnabled,
        forceTurn: !!state.forceTurnEnabled,
        bitrate: state.voiceBitrate || 64,
        volume: state.masterVolume,
        onChange: (patch) => {
          if (!patch || typeof patch !== 'object') return;
          if ('mode' in patch) { state.voiceMode = patch.mode; try { localStorage.setItem('voiceMode', patch.mode); } catch (_) {} }
          if ('inputId' in patch) state.inputDeviceId = patch.inputId;
          if ('outputId' in patch) state.outputDeviceId = patch.outputId;
          if ('vadThreshold' in patch) state.vadThreshold = patch.vadThreshold;
          if ('rnnoise' in patch) state.rnnoiseEnabled = patch.rnnoise;
          if ('autoGain' in patch) state.autoGainEnabled = patch.autoGain;
          if ('forceTurn' in patch) state.forceTurnEnabled = patch.forceTurn;
          if ('bitrate' in patch) state.voiceBitrate = patch.bitrate;
          if ('volume' in patch) state.masterVolume = patch.volume;
        },
        onSave: () => { persist(); state.voiceSettingsOpen = false; },
        onCancel: () => { state.voiceSettingsOpen = false; },
        onClose: () => { state.voiceSettingsOpen = false; }
      });
    }

    function render() { applyDiff(host, view()); }

    effect(() => {
      window.stateSignals.voiceSettingsOpen.value;
      window.stateSignals.inputDevices.value;
      window.stateSignals.outputDevices.value;
      window.stateSignals.inputDeviceId.value;
      window.stateSignals.outputDeviceId.value;
      window.stateSignals.vadThreshold.value;
      window.stateSignals.rnnoiseEnabled.value;
      window.stateSignals.autoGainEnabled.value;
      window.stateSignals.forceTurnEnabled.value;
      window.stateSignals.voiceBitrate.value;
      window.stateSignals.masterVolume.value;
      render();
    });
  }
  init();
})();
