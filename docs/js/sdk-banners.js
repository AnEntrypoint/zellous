(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.Banner) { setTimeout(init, 30); return; }

    const { applyDiff, C } = sdk;

    // Reconnect banner — driven by isConnected signal.
    const reconnectHost = document.getElementById('reconnectBanner');
    if (reconnectHost) {
      function renderReconnect() {
        const connected = !!window.stateSignals?.isConnected?.value;
        applyDiff(reconnectHost, C.Banner({
          tone: 'warning',
          message: 'No relay connected. Reconnecting...',
          visible: !connected,
        }));
      }
      effect(() => {
        window.stateSignals?.isConnected?.value;
        renderReconnect();
      });
    }

    // Voice-connected banner — visible when in voice but viewing different channel.
    const voiceHost = document.getElementById('voiceConnectedBanner');
    if (voiceHost) {
      function renderVoice() {
        const ss = window.stateSignals;
        const connected = !!ss?.voiceConnected?.value;
        const voiceCh = ss?.voiceChannelName?.value || '';
        const curCh = ss?.currentChannel?.value;
        const sameView = connected && voiceCh && voiceCh === curCh?.name && curCh?.type === 'voice';
        const visible = connected && !sameView;
        applyDiff(voiceHost, C.Banner({
          tone: 'success',
          message: visible ? ('In voice: ' + (voiceCh || '—') + ' — click to return') : '',
          visible,
          actionLabel: 'Leave',
          onAction: (e) => {
            if (e?.stopPropagation) e.stopPropagation();
            if (window.lk?.disconnect) window.lk.disconnect();
          },
          onClick: () => {
            if (!voiceCh) return;
            const ch = (window.state?.channels || []).find(c => c.type === 'voice' && c.name === voiceCh);
            if (ch && window.ui?.actions?.switchChannel) window.ui.actions.switchChannel(ch);
          },
        }));
      }
      effect(() => {
        const ss = window.stateSignals;
        ss?.voiceConnected?.value;
        ss?.voiceChannelName?.value;
        ss?.currentChannel?.value;
        renderVoice();
      });
    }
  }
  init();
})();
