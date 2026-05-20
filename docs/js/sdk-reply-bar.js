(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.ReplyBar) { setTimeout(init, 30); return; }
    if (!window.stateSignals?.replyTarget) { setTimeout(init, 30); return; }
    const { applyDiff, C } = sdk;

    let host = document.getElementById('sdkReplyBarHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sdkReplyBarHost';
      const chatArea = document.getElementById('chatArea');
      if (chatArea && chatArea.parentElement) {
        chatArea.parentElement.insertBefore(host, chatArea);
      } else {
        document.body.appendChild(host);
      }
    }

    function syncFromLegacy() {
      const legacy = window.ui?._replyTarget || null;
      if (legacy && legacy !== window.stateSignals.replyTarget.value) {
        state.replyTarget = legacy;
      } else if (!legacy && window.stateSignals.replyTarget.value) {
        state.replyTarget = null;
      }
    }

    if (window.ui) {
      let _rt = window.ui._replyTarget;
      try {
        Object.defineProperty(window.ui, '_replyTarget', {
          configurable: true,
          get() { return _rt; },
          set(v) { _rt = v; state.replyTarget = v; }
        });
      } catch (_) {}
    }

    function view() {
      const rt = state.replyTarget;
      if (!rt) return null;
      return C.ReplyBar({
        quotedMessage: rt.content || '',
        quotedAuthor: rt.username || rt.userId || 'User',
        onCancel: () => {
          state.replyTarget = null;
          if (window.ui) try { window.ui._replyTarget = null; } catch (_) {}
          document.getElementById('replyComposeBar')?.remove();
        }
      });
    }

    function render() { applyDiff(host, view()); }

    effect(() => {
      window.stateSignals.replyTarget.value;
      render();
    });

    syncFromLegacy();
  }
  init();
})();
