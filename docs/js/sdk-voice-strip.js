(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C) {
      setTimeout(init, 30);
      return;
    }
    const host = document.getElementById('voiceStripSlot');
    if (!host) return;

    const { applyDiff, C } = sdk;
    host.innerHTML = '';

    function view() {
      const connected = !!state.voiceConnected;
      if (!connected) return null;
      return C.VoiceStrip({
        channelName: state.voiceChannelName || (state.currentChannel && state.currentChannel.name) || 'voice',
        status: state.voiceConnectionState || 'connected',
        muted: !!state.micMuted,
        deafened: !!state.voiceDeafened,
        onMute: () => {
          if (window.lk?.toggleMic) window.lk.toggleMic();
          else if (window.uiActions?.toggleMute) window.uiActions.toggleMute();
          else state.micMuted = !state.micMuted;
        },
        onDeafen: () => {
          if (window.lk?.toggleDeafen) window.lk.toggleDeafen();
          else if (window.uiActions?.toggleDeafen) window.uiActions.toggleDeafen();
          else state.voiceDeafened = !state.voiceDeafened;
        },
        onLeave: () => {
          if (window.wireweave?.voice?.leave) return window.wireweave.voice.leave();
          if (window.voice?.leave) return window.voice.leave();
          if (window.lk?.disconnect) return window.lk.disconnect();
        },
        open: connected
      });
    }

    function render() {
      const v = view();
      if (v == null) {
        host.innerHTML = '';
        return;
      }
      applyDiff(host, v);
    }

    effect(() => {
      window.stateSignals.voiceConnected.value;
      window.stateSignals.voiceChannelName.value;
      window.stateSignals.voiceConnectionState.value;
      window.stateSignals.micMuted.value;
      window.stateSignals.voiceDeafened.value;
      window.stateSignals.currentChannel.value;
      render();
    });
  }
  init();
})();
