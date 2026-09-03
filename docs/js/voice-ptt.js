// voice-ptt.js — PTT mic gate + queue UI on top of wireweave 0.2 voice.
// Wireweave handles: speaker-activity detection, anti-overtalk transmit gate,
// per-peer data-channel segment broadcast. This file:
//   - drives requestTransmit / releaseTransmit on hold-start / release
//   - renders inbound segment queue + plays segments FIFO
//   - tracks transmit mode (live / queued / idle) as plain state, not DOM —
//     the SDK's own .vx-ptt button (mountCommunityApp) is the visual surface;
//     nostr-adapter.js's pttStart/pttStop actions call holdStart/holdEnd
//     below and its state.pttState/pttLabel/pttDisabled feed the button's
//     state/label/disabled props.

(function () {
  const KEY_HOLD = 'Space';

  let pttHeld = false;
  let attached = false;
  let connected = false;
  let lastConnected = null;
  let inboundQueue = [];        // { segId, name, mime, bytes, dur, ts, url? }
  let playing = null;           // currently-playing segment
  let playerEl = null;          // <audio>
  let unsubs = [];
  let pttState = 'idle';        // idle | live | queued | realtime
  let pttLabel = 'Hold to talk';
  let pttDisabled = false;

  // Channel mode is published with the channel metadata (owner-controlled),
  // so every participant sees the same mode. We read it off the live channel
  // object from state; localStorage is only consulted as a last-ditch fallback
  // for older clients that wrote there before the migration. A personal
  // vadEnabled setting (Voice Settings modal) overrides the channel default
  // to 'vad' for that user only — it's a client-side preference, not
  // server-published state.
  function modeKey(channelId) { return 'zn_voice_mode_' + (channelId || 'default'); }
  function getChannelMode(channelId) {
    if (window.state?.vadEnabled) return 'vad';
    var chs = (window.state && window.state.channels) || [];
    for (var i = 0; i < chs.length; i++) {
      if (chs[i].id === channelId) {
        if (chs[i].voiceMode) return chs[i].voiceMode;
        break;
      }
    }
    try { return localStorage.getItem(modeKey(channelId)) || 'ptt'; } catch { return 'ptt'; }
  }
  function currentChannelMode() {
    return getChannelMode(window.state?.currentChannel?.id);
  }
  window.__zellous = window.__zellous || {};
  window.__zellous.voiceMode = {
    get: getChannelMode,
    apply: () => applyMode(currentChannelMode())
  };

  function setPillState(mode) {
    pttState = mode;
    if (window.state) window.state.pttState = mode;
  }

  function renderQueue() {
    const count = inboundQueue.length + (playing ? 1 : 0);
    if (window.state) {
      window.state.pttQueueCount = count;
      window.state.pttQueuePlaying = !!playing;
    }
  }

  function holdStart() {
    if (pttHeld || !connected) return;
    if (currentChannelMode() === 'realtime') return; // no PTT in realtime mode
    if (window.state?.voiceDeafened) return;
    pttHeld = true;
    const live = window.lk?.requestTransmit?.();
    setPillState(live ? 'live' : 'queued');
  }
  function holdEnd() {
    if (!pttHeld) return;
    pttHeld = false;
    window.lk?.releaseTransmit?.();
    setPillState('idle');
  }

  // ── Transmit-mode events from voice (auto-flip live↔queued)
  function onTransmit(e) {
    if (!pttHeld) return;
    const m = e.detail?.mode || 'idle';
    if (m === 'idle') return;
    setPillState(m);
  }

  // requestTransmit() returning false previously looked identical whether
  // the remote channel was just busy (a normal "queued" state) or there was
  // no microphone at all (joined listen-only, per the earlier connect()
  // fallback) -- holding the pill silently did nothing in the latter case
  // with zero user-facing signal. voice.js now emits this distinctly.
  function onTransmitDenied(e) {
    if (e.detail?.reason === 'no-microphone' && window.ui?.showToast) {
      ui.showToast('No microphone available — you joined this voice channel listen-only', 3500, 'error');
    }
  }

  // ── Inbound queue: segments arrive via dc; we play them FIFO through an
  //    <audio> element. Realtime listening is unaffected (the analyzer + mix
  //    of remote tracks happens via wireweave's own audioEls created by the
  //    onAudioTrack callback in wireweave-bridge.js).
  function onSegment(e) {
    const seg = e.detail?.segment; if (!seg?.bytes?.length) return;
    inboundQueue.push(seg);
    renderQueue();
    drainQueue();
  }

  async function drainQueue() {
    if (playing) return;
    const next = inboundQueue.shift();
    if (!next) { renderQueue(); return; }
    playing = next;
    renderQueue();
    if (!playerEl) {
      playerEl = document.createElement('audio');
      playerEl.id = 'pttQueuePlayer';
      playerEl.autoplay = true;
      playerEl.style.display = 'none';
      document.body.appendChild(playerEl);
    }
    try {
      const blob = new Blob([next.bytes], { type: next.mime || 'audio/webm' });
      const url = URL.createObjectURL(blob);
      playerEl.src = url;
      const cleanup = () => { URL.revokeObjectURL(url); playerEl.removeEventListener('ended', onEnd); playerEl.removeEventListener('error', onEnd); };
      const onEnd = () => { cleanup(); playing = null; renderQueue(); drainQueue(); };
      playerEl.addEventListener('ended', onEnd);
      playerEl.addEventListener('error', onEnd);
      try { await playerEl.play(); } catch { onEnd(); }
    } catch { playing = null; renderQueue(); drainQueue(); }
  }

  function skipQueue() {
    inboundQueue = [];
    if (playerEl) { try { playerEl.pause(); playerEl.removeAttribute('src'); playerEl.load(); } catch {} }
    playing = null;
    renderQueue();
  }

  function attachKeyboard() {
    if (attached) return;
    attached = true;
    window.addEventListener('keydown', e => {
      if (!connected || e.code !== KEY_HOLD || e.repeat) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault(); holdStart();
    });
    window.addEventListener('keyup', e => {
      if (e.code !== KEY_HOLD) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      holdEnd();
    });
    window.addEventListener('blur', holdEnd);
    document.addEventListener('visibilitychange', () => { if (document.hidden) holdEnd(); });
  }

  // ── VAD mode: auto request/release transmit off wireweave's own local
  //    speaker-activity detector (real AnalyserNode RMS, not a stub), instead
  //    of the PTT pill's manual hold/release.
  let vadActive = false;
  function onLocalSpeaker(e) {
    if (currentChannelMode() !== 'vad') return;
    const d = e.detail; if (!d || d.isLocal !== true) return;
    if (d.speaking && !vadActive) { vadActive = true; holdStart(); }
    else if (!d.speaking && vadActive) { vadActive = false; holdEnd(); }
  }

  // Switch the pill / mic between PTT, VAD, and Realtime modes. In realtime
  // mode we keep the mic open (lk.setMuted(false)) and the SDK's .vx-ptt
  // button (fed by state.pttState/pttLabel/pttDisabled via nostr-adapter.js)
  // shows a static "Live mic" badge. In VAD mode the button is decorative
  // (state driven by onLocalSpeaker) and hold/release is automatic.
  function applyMode(mode) {
    if (mode === 'realtime') {
      try { window.lk?.setMuted?.(false); } catch {}
      pttLabel = 'Live';
      pttDisabled = true;
      setPillState('realtime');
    } else if (mode === 'vad') {
      try { window.lk?.setMuted?.(true); } catch {}
      pttLabel = 'Voice-activated';
      pttDisabled = true;
      setPillState('idle');
    } else {
      if (vadActive) { vadActive = false; holdEnd(); }
      try { window.lk?.setMuted?.(true); } catch {}
      pttLabel = 'Hold to talk';
      pttDisabled = false;
      setPillState('idle');
    }
    if (window.state) { window.state.pttLabel = pttLabel; window.state.pttDisabled = pttDisabled; }
  }

  function onVoiceConnected() {
    connected = true;
    setPillState('idle');
    renderQueue();
    applyMode(currentChannelMode());
    // bind voice events
    if (window.lk?.on) {
      unsubs.push(window.lk.on('transmit', onTransmit));
      unsubs.push(window.lk.on('transmit-denied', onTransmitDenied));
      unsubs.push(window.lk.on('segment-received', onSegment));
      unsubs.push(window.lk.on('speaker', onLocalSpeaker));
      // segment-finalized just signals that the held buffer was packed up; transmit-mode
      // is the source of truth for the pill, so we don't override it from here.
    }
  }
  function onVoiceDisconnected() {
    connected = false;
    vadActive = false;
    holdEnd();
    skipQueue();
    while (unsubs.length) { try { unsubs.pop()(); } catch {} }
  }

  let pollHandle = null;
  function poll() {
    if (pollHandle) return;
    pollHandle = setInterval(() => {
      const cur = !!window.state?.voiceConnected;
      if (cur === lastConnected) return;
      lastConnected = cur;
      cur ? onVoiceConnected() : onVoiceDisconnected();
    }, 250);
  }
  function stop() {
    if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
    onVoiceDisconnected();
  }

  function init() {
    attachKeyboard();
    poll();
    window.__zellous = window.__zellous || {};
    window.__zellous.pttGate = {
      holdStart, holdEnd,
      isHeld: () => pttHeld,
      isConnected: () => connected,
      get queue() { return { pending: inboundQueue.length, playing: !!playing }; },
      get state() { return pttState; },
      get label() { return pttLabel; },
      get disabled() { return pttDisabled; },
      skipQueue,
      stop
    };
    window.addEventListener('beforeunload', stop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
