(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.C.AudioQueue) { setTimeout(init, 30); return; }
    if (!window.stateSignals?.audioQueueItems) { setTimeout(init, 30); return; }
    const { applyDiff, C } = sdk;

    let host = document.getElementById('sdkAudioQueueHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sdkAudioQueueHost';
      const parent = document.getElementById('audioQueueView')?.parentElement || document.body;
      parent.appendChild(host);
    }

    function pickColor(userId) {
      const colors = window.AVATAR_COLORS || ['#3F8A4A','#6FA9FF','#FFD86B','#FF8454','#6B3A78','#F07AA8'];
      const s = String(userId || '');
      let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      return colors[h % colors.length];
    }

    function syncFromLegacy() {
      const all = window.stateSignals.audioQueue.value || [];
      const segments = all.map(s => ({
        id: s.id,
        speaker: s.username || 'User',
        duration: (s.decodedSamples?.reduce((a, d) => a + d.length, 0) || 0) / 48000,
        color: pickColor(s.userId),
        isLive: s.status === 'playing' || s.status === 'recording'
      }));
      state.audioQueueItems = segments;
      state.audioQueueCurrentId = window.stateSignals.currentSegmentId.value || window.stateSignals.replayingSegmentId.value || null;
    }

    const _origRender = window.ui?.render?.queue;
    if (window.ui?.render) {
      window.ui.render.queue = function () {
        try { _origRender?.apply(this, arguments); } catch (_) {}
        try { syncFromLegacy(); } catch (_) {}
      };
    }

    function view() {
      return C.AudioQueue({
        segments: state.audioQueueItems || [],
        currentSegmentId: state.audioQueueCurrentId,
        paused: !!state.audioQueuePaused,
        onReplay: (id) => { try { window.queue?.replaySegment?.(id, true); } catch (_) {} },
        onSkip: () => { try { window.queue?.stopReplay?.(); window.queue?.playNext?.(); } catch (_) {} },
        onResume: () => { state.audioQueuePaused = false; try { window.queue?.resumePlayback?.(); } catch (_) {} },
        onPause: () => { state.audioQueuePaused = true; try { window.queue?.pausePlayback?.(); } catch (_) {} }
      });
    }

    function render() { applyDiff(host, view()); }

    effect(() => {
      window.stateSignals.audioQueueItems.value;
      window.stateSignals.audioQueueCurrentId.value;
      window.stateSignals.audioQueuePaused.value;
      render();
    });

    syncFromLegacy();
  }
  init();
})();
