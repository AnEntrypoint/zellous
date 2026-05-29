(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.UserPanel) { setTimeout(init, 30); return; }
    const host = document.getElementById('userPanelSlot');
    if (!host) return;

    const { applyDiff, C } = sdk;
    host.innerHTML = '';

    function selfName() {
      const u = state.currentUser;
      return (u && (u.displayName || u.username || u.name)) || 'You';
    }
    function selfColor() {
      const id = state.userId || state.nostrPubkey;
      return (window.getAvatarColor && id) ? window.getAvatarColor(id) : null;
    }
    function shortTag() {
      const pk = state.nostrPubkey;
      return pk ? (pk.slice(0, 6) + '…' + pk.slice(-4)) : null;
    }

    function view() {
      return C.UserPanel({
        name: selfName(),
        tag: shortTag(),
        color: selfColor(),
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
        onSettings: () => {
          if (window.ui?.actions?.toggleSettings) window.ui.actions.toggleSettings();
        }
      });
    }

    function render() { applyDiff(host, view()); }

    effect(() => {
      window.stateSignals.currentUser.value;
      window.stateSignals.micMuted.value;
      window.stateSignals.voiceDeafened.value;
      render();
    });
  }
  init();
})();
