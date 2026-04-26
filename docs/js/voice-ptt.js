// voice-ptt.js — minimal PTT mic gate over the wireweave voice API.
// First slice of the realtime/PTT/queue/anti-overtalk PRD: gates the
// local mic so it is muted by default while in a voice channel and
// unmutes only while the PTT pill (or Space-bar) is held.
//
// Anti-overtalk + queue capture/drain land in subsequent passes —
// this file should remain ≤200 lines and own only the gate + UI pill.

(function() {
  const KEY_HOLD = 'Space';
  const PILL_ID = 'pttPill';
  let pttHeld = false;
  let attached = false;
  let connected = false;

  function setMuted(want) {
    const lk = window.lk;
    if (!lk || typeof lk.toggleMic !== 'function') return false;
    const cur = !!window.state?.micMuted;
    if (cur !== want) lk.toggleMic();
    return true;
  }

  function holdStart() {
    if (pttHeld || !connected) return;
    if (window.state?.voiceDeafened) return;
    pttHeld = true;
    setMuted(false);
    pillEl()?.classList.add('active');
    pillEl()?.setAttribute('data-state', 'live');
  }
  function holdEnd() {
    if (!pttHeld) return;
    pttHeld = false;
    setMuted(true);
    pillEl()?.classList.remove('active');
    pillEl()?.setAttribute('data-state', 'idle');
  }

  function pillEl() { return document.getElementById(PILL_ID); }

  function ensurePill() {
    const bar = document.getElementById('voiceControlsBar');
    if (!bar) return null;
    let pill = pillEl();
    if (pill) return pill;
    pill = document.createElement('button');
    pill.id = PILL_ID;
    pill.className = 'voice-ptt-pill';
    pill.type = 'button';
    pill.setAttribute('data-state', 'idle');
    pill.setAttribute('title', 'Hold to talk (or hold Space)');
    pill.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 15c1.66 0 2.99-1.34 2.99-3L15 6c0-1.66-1.34-3-3-3S9 4.34 9 6v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 15 6.7 12H5c0 3.42 2.72 6.23 6 6.72V22h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg><span class="voice-ptt-label">Hold to talk</span>';
    // insert as first child so it leads the controls bar
    bar.insertBefore(pill, bar.firstChild);
    pill.addEventListener('mousedown', e => { e.preventDefault(); holdStart(); });
    pill.addEventListener('mouseup',   e => { e.preventDefault(); holdEnd(); });
    pill.addEventListener('mouseleave',  () => { if (pttHeld) holdEnd(); });
    pill.addEventListener('touchstart', e => { e.preventDefault(); holdStart(); }, { passive: false });
    pill.addEventListener('touchend',   e => { e.preventDefault(); holdEnd(); });
    pill.addEventListener('touchcancel',() => holdEnd());
    pill.addEventListener('contextmenu', e => e.preventDefault());
    return pill;
  }

  function attachKeyboard() {
    if (attached) return;
    attached = true;
    window.addEventListener('keydown', e => {
      if (!connected) return;
      if (e.code !== KEY_HOLD) return;
      // ignore when typing
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      holdStart();
    });
    window.addEventListener('keyup', e => {
      if (e.code !== KEY_HOLD) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      holdEnd();
    });
    // safety: release on blur / visibility change
    window.addEventListener('blur', holdEnd);
    document.addEventListener('visibilitychange', () => { if (document.hidden) holdEnd(); });
  }

  function onVoiceConnected() {
    connected = true;
    ensurePill();
    // force muted default (gate closed) — wireweave defaults to unmuted on join
    if (window.state && window.state.micMuted === false) setMuted(true);
    // make sure the existing voiceMicBtn reflects gate state
    const m = document.getElementById('voiceMicBtn');
    if (m) { m.setAttribute('title', 'Mic gate (default closed; PTT unlocks)'); m.classList.toggle('muted', !!window.state.micMuted); }
  }
  function onVoiceDisconnected() {
    connected = false;
    holdEnd();
    pillEl()?.remove();
  }

  function poll() {
    // wireweave posts 'connected' / 'disconnected' on the voice actor; bridge already
    // mirrors into state.voiceConnected, so we observe that.
    let last = null;
    setInterval(() => {
      const cur = !!window.state?.voiceConnected;
      if (cur === last) return;
      last = cur;
      cur ? onVoiceConnected() : onVoiceDisconnected();
    }, 250);
  }

  function init() {
    attachKeyboard();
    poll();
    window.__zellous = window.__zellous || {};
    window.__zellous.pttGate = { holdStart, holdEnd, isHeld: () => pttHeld, isConnected: () => connected };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
