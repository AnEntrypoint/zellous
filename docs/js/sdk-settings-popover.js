(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.SettingsPopover) {
      setTimeout(init, 30);
      return;
    }
    const { applyDiff, C } = sdk;

    let host = document.getElementById('settingsPopoverHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'settingsPopoverHost';
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
      } catch (_) {
        devicesLoaded = false;
      }
    }

    window.openSettings = function (anchorEl) {
      let x = 200, y = 200;
      const el = anchorEl && anchorEl.getBoundingClientRect ? anchorEl : (typeof anchorEl === 'object' && anchorEl ? null : null);
      if (el) {
        const r = el.getBoundingClientRect();
        x = r.right; y = r.bottom;
      } else if (anchorEl && typeof anchorEl.x === 'number') {
        x = anchorEl.x; y = anchorEl.y;
      }
      state.settingsAnchor = { x, y };
      state.settingsOpen = true;
      loadDevices();
    };

    function view() {
      const open = !!state.settingsOpen;
      const anchor = state.settingsAnchor || { x: 200, y: 200 };
      const inputDevices = state.inputDevices || [];
      const outputDevices = state.outputDevices || [];
      const inputId = state.inputDeviceId;
      const outputId = state.outputDeviceId;
      const rnnoise = !!state.rnnoiseEnabled;
      const autoGain = !!state.autoGainEnabled;
      const forceTurn = !!state.forceTurnEnabled;
      const dataChannel = !!state.dataChannelEnabled;
      const rawPct = Math.round((state.micRawLevel || 0) * 100);
      const procPct = Math.round((state.micProcessedLevel || 0) * 100);
      const isLoggedIn = !!state.isAuthenticated || !!state.nostrPubkey;

      const sections = [
        {
          id: 'devices',
          label: 'Audio Devices',
          items: [
            {
              kind: 'select',
              label: 'Input',
              value: inputId,
              options: inputDevices.map(d => ({ value: d.deviceId, label: d.label })),
              onChange: (v) => { state.inputDeviceId = v; try { localStorage.setItem('preferredInputDevice', v); } catch (_) {} }
            },
            {
              kind: 'select',
              label: 'Output',
              value: outputId,
              options: outputDevices.map(d => ({ value: d.deviceId, label: d.label })),
              onChange: (v) => { state.outputDeviceId = v; try { localStorage.setItem('preferredOutputDevice', v); } catch (_) {} }
            }
          ]
        },
        {
          id: 'processing',
          label: 'Processing',
          items: [
            {
              kind: 'toggle',
              label: 'RNNoise',
              value: rnnoise,
              onChange: (v) => { state.rnnoiseEnabled = v; try { localStorage.setItem('rnnoise', v ? '1' : '0'); } catch (_) {} }
            },
            {
              kind: 'toggle',
              label: 'Auto Gain',
              value: autoGain,
              onChange: (v) => { state.autoGainEnabled = v; try { localStorage.setItem('autoGain', v ? '1' : '0'); } catch (_) {} }
            },
            { kind: 'text', label: 'Mic monitor: raw ' + rawPct + '% / processed ' + procPct + '%' }
          ]
        },
        {
          id: 'network',
          label: 'Network',
          items: [
            {
              kind: 'toggle',
              label: 'Force TURN relay',
              value: forceTurn,
              onChange: (v) => { state.forceTurnEnabled = v; try { localStorage.setItem('forceRelay', v ? '1' : '0'); } catch (_) {} }
            },
            {
              kind: 'toggle',
              label: 'Use data channel',
              value: dataChannel,
              onChange: (v) => { state.dataChannelEnabled = v; try { localStorage.setItem('dataChannel', v ? '1' : '0'); } catch (_) {} }
            }
          ]
        }
      ];

      if (isLoggedIn) {
        sections.push({
          id: 'actions',
          label: 'Account',
          items: [
            { kind: 'button', label: 'Sign out', danger: true, onClick: () => { try { window.auth?.signOut?.() || window.auth?.logout?.(); } catch (_) {} state.settingsOpen = false; } }
          ]
        });
      }

      return C.SettingsPopover({
        title: 'Settings',
        open,
        anchorX: anchor.x,
        anchorY: anchor.y,
        sections,
        onClose: () => { state.settingsOpen = false; }
      });
    }

    function render() { applyDiff(host, view()); }

    effect(() => {
      window.stateSignals.settingsOpen.value;
      window.stateSignals.settingsAnchor.value;
      window.stateSignals.inputDevices.value;
      window.stateSignals.outputDevices.value;
      window.stateSignals.inputDeviceId.value;
      window.stateSignals.outputDeviceId.value;
      window.stateSignals.rnnoiseEnabled.value;
      window.stateSignals.autoGainEnabled.value;
      window.stateSignals.forceTurnEnabled.value;
      window.stateSignals.dataChannelEnabled.value;
      window.stateSignals.micRawLevel.value;
      window.stateSignals.micProcessedLevel.value;
      window.stateSignals.isAuthenticated.value;
      render();
    });
  }
  init();
})();
