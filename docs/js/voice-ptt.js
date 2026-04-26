// voice-ptt.js — PTT mic gate + queue UI on top of wireweave 0.2 voice.
// Wireweave handles: speaker-activity detection, anti-overtalk transmit gate,
// per-peer data-channel segment broadcast. This file:
//   - inserts the "Hold to talk" pill into #voiceControlsBar
//   - drives requestTransmit / releaseTransmit on hold-start / release
//   - renders inbound segment queue + plays segments FIFO
//   - shows transmit mode (live / queued / idle) on the pill
//   - shows queue count badge

(function () {
  const KEY_HOLD = 'Space';
  const PILL_ID = 'pttPill';
  const QUEUE_ID = 'pttQueue';

  let pttHeld = false;
  let attached = false;
  let connected = false;
  let lastConnected = null;
  let inboundQueue = [];        // { segId, name, mime, bytes, dur, ts, url? }
  let playing = null;           // currently-playing segment
  let playerEl = null;          // <audio>
  let unsubs = [];

  function pillEl()  { return document.getElementById(PILL_ID); }
  function queueEl() { return document.getElementById(QUEUE_ID); }

  function ensurePill() {
    const bar = document.getElementById('voiceControlsBar');
    if (!bar) return null;
    let pill = pillEl();
    if (!pill) {
      pill = document.createElement('button');
      pill.id = PILL_ID;
      pill.className = 'voice-ptt-pill';
      pill.type = 'button';
      pill.setAttribute('data-state', 'idle');
      pill.setAttribute('title', 'Hold to talk (or hold Space)');
      pill.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 15 6.7 12H5c0 3.42 2.72 6.23 6 6.72V22h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg><span class="voice-ptt-label">Hold to talk</span>';
      bar.insertBefore(pill, bar.firstChild);
      pill.addEventListener('mousedown',  e => { e.preventDefault(); holdStart(); });
      pill.addEventListener('mouseup',    e => { e.preventDefault(); holdEnd(); });
      pill.addEventListener('mouseleave', () => { if (pttHeld) holdEnd(); });
      pill.addEventListener('touchstart', e => { e.preventDefault(); holdStart(); }, { passive: false });
      pill.addEventListener('touchend',   e => { e.preventDefault(); holdEnd(); });
      pill.addEventListener('touchcancel',() => holdEnd());
      pill.addEventListener('contextmenu', e => e.preventDefault());
    }
    let q = queueEl();
    if (!q) {
      q = document.createElement('div');
      q.id = QUEUE_ID;
      q.className = 'voice-ptt-queue';
      q.setAttribute('data-empty', 'true');
      q.innerHTML = '<span class="vptq-label">queue</span><span class="vptq-count">0</span><button class="vptq-skip" type="button" title="Skip queue">skip</button>';
      bar.appendChild(q);
      q.querySelector('.vptq-skip')?.addEventListener('click', () => skipQueue());
    }
    return pill;
  }

  function setPillState(mode) {
    const pill = pillEl(); if (!pill) return;
    pill.setAttribute('data-state', mode);
    pill.classList.toggle('active', mode === 'live');
    pill.classList.toggle('queued', mode === 'queued');
  }

  function renderQueue() {
    const q = queueEl(); if (!q) return;
    const count = inboundQueue.length + (playing ? 1 : 0);
    q.querySelector('.vptq-count').textContent = String(count);
    q.setAttribute('data-empty', count === 0 ? 'true' : 'false');
    q.classList.toggle('playing', !!playing);
  }

  function holdStart() {
    if (pttHeld || !connected) return;
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

  function onVoiceConnected() {
    connected = true;
    ensurePill();
    setPillState('idle');
    renderQueue();
    // bind voice events
    if (window.lk?.on) {
      unsubs.push(window.lk.on('transmit', onTransmit));
      unsubs.push(window.lk.on('segment-received', onSegment));
      // segment-finalized just signals that the held buffer was packed up; transmit-mode
      // is the source of truth for the pill, so we don't override it from here.
    }
  }
  function onVoiceDisconnected() {
    connected = false;
    holdEnd();
    skipQueue();
    while (unsubs.length) { try { unsubs.pop()(); } catch {} }
    pillEl()?.remove();
    queueEl()?.remove();
  }

  function poll() {
    setInterval(() => {
      const cur = !!window.state?.voiceConnected;
      if (cur === lastConnected) return;
      lastConnected = cur;
      cur ? onVoiceConnected() : onVoiceDisconnected();
    }, 250);
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
      skipQueue
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
