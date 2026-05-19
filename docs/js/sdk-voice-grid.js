(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C) {
      setTimeout(init, 30);
      return;
    }
    const host = document.getElementById('voiceGrid');
    if (!host) return;

    const { h, applyDiff, C } = sdk;
    host.innerHTML = '';

    function avatarColor(id) {
      return (window.getAvatarColor && window.getAvatarColor(id)) || 'var(--accent)';
    }

    function view() {
      const participants = state.voiceParticipants || [];
      const speakers = state.activeSpeakers || new Set();
      const tiles = participants.map(p => C.VoiceUser({
        identity: p.identity,
        speaking: speakers.has(p.identity) || !!p.isSpeaking,
        color: avatarColor(p.identity)
      }));
      return h('div', { class: 'voice-grid' }, ...tiles);
    }

    function render() { applyDiff(host, view()); }

    effect(() => {
      window.stateSignals.voiceParticipants.value;
      window.stateSignals.activeSpeakers.value;
      render();
    });

    if (window.uiVoice) window.uiVoice.renderGrid = function () {};
  }
  init();
})();
