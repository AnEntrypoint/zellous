// ICE servers. STUN-only: TURN is required for symmetric/restricted-cone NAT pairs
// (typical home routers, carrier-grade NAT, corporate networks) but no working free
// static-credential public TURN provider exists anymore -- confirmed via live
// RTCPeerConnection relay tests against 10+ candidates (metered.ca's current
// global.relay.metered.ca and its newer staticauth HMAC scheme, numb.viagenie.ca,
// several ~2013-era demo servers) plus research into every major current provider
// (Metered, ExpressTURN, Cloudflare Calls, TurnRelay, elixir-webrtc/rel): all now
// require account signup, several explicitly citing abuse prevention as why static
// credentials were retired. This repo already hit this exact dead-end once before
// (see git history for the openrelay.metered.ca -> global.relay.metered.ca swap,
// which has since also died) -- it's a recurring pattern with free-tier TURN, not a
// one-off broken link. A real fix needs either a paid/account-gated TURN provider
// with a credential-issuing proxy (Cloudflare's own docs require keeping the API
// token server-side, which this repo's no-backend design doesn't have) or a
// self-hosted relay -- deliberately not done here; peers needing TURN (symmetric
// NAT/CGNAT on both sides) will fail to connect until one of those is set up.
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:global.stun.twilio.com:3478' }
];
let ICE_SERVERS = DEFAULT_ICE_SERVERS;
export const setIceServers = (list) => { if (Array.isArray(list) && list.length) ICE_SERVERS = list; };
export const getIceServers = () => ICE_SERVERS.slice();
const hasTurnServer = () => ICE_SERVERS.some(s => (Array.isArray(s.urls) ? s.urls : [s.urls]).some(u => typeof u === 'string' && (u.startsWith('turn:') || u.startsWith('turns:'))));

const PRESENCE_EXPIRY = 300000;
const HEARTBEAT = 5000;        // tight cadence: heartbeat carries election scores + reflexive addr
const STALL_CHECK = 5000;
const DISCONNECT_GRACE = 8000;
// A peer whose pc never leaves 'new'/'connecting' (offer sent but the answer or
// the answerer's ICE candidates never arrive back over the Nostr relay -- dropped
// signal, relay hiccup, STUN gather that never completes) produces zero WebRTC
// state-change events: onconnectionstatechange only fires on connected/
// disconnected/failed/closed, none of which a stuck-at-'new' pc ever reaches on
// its own. Every existing recovery path (_doIceRestart, _checkStall,
// _scheduleReconnect) is gated on one of those events firing, so without this
// watchdog such a peer hangs forever. Set equal to DISCONNECT_GRACE: comfortably
// above real STUN/TURN gather + multi-relay Nostr round-trip latency, while
// keeping worst-case perceived stall bounded to the same window as the existing
// disconnected-branch recovery.
const CONNECT_TIMEOUT = 8000;
const HUB_HYSTERESIS_MS = 8000; // minimum hold-time before re-election can replace incumbent
const HUB_REL_ADVANTAGE = 0.25; // challenger must beat incumbent by ≥25% to take over

// Speaker-activity / queue / anti-overtalk tunables
const SPEAKER_ACTIVE_RMS = 0.045;     // RMS threshold above which a stream counts as "speaking"
const SPEAKER_HOLD_MS = 350;          // tail: stay marked speaking this long after last frame > threshold
const SPEAKER_POLL_MS = 80;           // analyzer poll cadence
const LEVEL_METER_CEILING = 0.35;     // raw RMS mapped to a full 0-1 meter bar (empirical loud-speech ceiling)
const QUEUE_MAX_SEGMENT_MS = 30000;   // hard cap per segment
const QUEUE_MIME_PREFS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
const DC_LABEL = 'wireweave-queue';
const DC_CHUNK_MAX = 14000;           // ~14 KB SCTP-friendly chunks
const DC_HEADER = 'WW1';              // protocol marker

// Opus bitrate ladder: named quality tiers applied to the outbound audio
// RTCRtpSender's encoding via setParameters(). This is the real mechanism
// available for a single (non-simulcast) Opus sender — see the simulcast
// note on VoiceSession below for why per-layer simulcast is out of scope.
const OPUS_BITRATE_LADDER = {
  low: 16000,
  medium: 32000,
  high: 48000,
  max: 64000
};
const DEFAULT_AUDIO_QUALITY = 'high';

const deriveRoomId = async (serverId, channel) => {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode((serverId || 'default') + ':voice:' + channel));
  return 'zellous' + Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

// See data.js's defaultCreatePeerConnection for why this hook exists: it lets
// a Node host inject a natively-tuned peer (ICE/UDP muxing, fixed port range,
// proxy passthrough) without wireweave depending on any Node WebRTC binding.
const defaultCreatePeerConnection = (config) => new RTCPeerConnection(config);

// SIMULCAST-LITE — scope verified against the real API surface used in this
// file before promising it. Real browser simulcast (multiple RTCRtpEncodingParameters
// with distinct `rid`/`scaleResolutionDownBy` on one RTCRtpSender) is a VIDEO-only
// technique: Opus is not encoded per-layer, and every addTransceiver/addTrack call
// site in this file (see `_maybeConnect`, `_handleSignal`'s doAnswer) sends audio
// only — `cameraStream` is a field with no producer, there is no video sendrecv
// transceiver anywhere in this module. Promising `sendEncodings` simulcast here
// would be fabricated. The honest, reachable analog for a single-encoding Opus
// sender is *adaptive bitrate switching* driven by live getStats() (already
// polled in `_sfuPoll`) — `setAudioQuality`/the bitrate ladder below is that
// real, verifiable mechanism, not simulcast. If/when this module gains a real
// video sender, true simulcast (sendEncodings on addTransceiver) becomes
// reachable and should replace this note.
export class VoiceSession extends EventTarget {
  constructor({
    fsm, xstate, relayPool, auth, mediaDevices, bans = null, serverId = '',
    onAudioTrack = null, onVideoTrack = null, createPeerConnection = defaultCreatePeerConnection,
    pttMode = true, micSensitivity = SPEAKER_ACTIVE_RMS, noiseSuppression = true,
    echoCancellation = true, autoGainControl = true, audioQuality = DEFAULT_AUDIO_QUALITY, dtx = true, fec = true,
    forceRelay = false
  }) {
    super();
    if (!fsm || !xstate || !relayPool || !auth || !mediaDevices) throw new Error('VoiceSession: missing deps');
    this.fsm = fsm; this.xstate = xstate; this.pool = relayPool; this.auth = auth; this.md = mediaDevices; this.bans = bans;
    this.serverId = serverId;
    this.onAudioTrack = onAudioTrack; this.onVideoTrack = onVideoTrack;
    this.createPeerConnection = createPeerConnection;
    this.actor = null;
    this.channelName = ''; this.roomId = '';
    this.peers = new Map(); this.participants = new Map();
    this.localStream = null; this.cameraStream = null;
    this.heartbeat = null; this.joinTs = 0;
    this.muted = false; this.deafened = false;
    this.sfu = { mode: 'mesh', hub: null, hubLostAt: null, rttMatrix: new Map(), electionTimer: null, statsInterval: null, actor: null };
    this.retrySchedule = {};
    this._epoch = 0;
    // Push-to-talk mode: when true (default, matches prior hardcoded behavior),
    // connect() starts muted and the caller must setMuted(false)/requestTransmit()
    // to speak. When false, connect() starts unmuted (open-mic / voice-activity mode).
    this.pttMode = !!pttMode;
    // Mic-sensitivity threshold: RMS level above which the speaker-activity
    // detector (_pollActivity) counts a stream as "speaking". Was a hardcoded
    // module constant (SPEAKER_ACTIVE_RMS); now a real per-instance, live-settable value.
    this.micSensitivity = typeof micSensitivity === 'number' && micSensitivity > 0 ? micSensitivity : SPEAKER_ACTIVE_RMS;
    // getUserMedia audio constraints — were hardcoded `true` at the single
    // getUserMedia call site in connect(); now real constructor-configurable
    // fields actually threaded into that call.
    this.noiseSuppression = !!noiseSuppression;
    this.echoCancellation = !!echoCancellation;
    this.autoGainControl = !!autoGainControl;
    this.deviceId = null;
    // Opus bitrate ladder tier + DTX (discontinuous transmission / silence
    // suppression). Applied for real in _applyAudioHints (bitrate, via the
    // existing RTCRtpSender.setParameters call) and _mungeDtx (DTX, via
    // real SDP fmtp munging — DTX is not an RTCRtpEncodingParameters field in
    // the actual spec, it is negotiated in the Opus fmtp line).
    this.setAudioQuality(audioQuality);
    this.dtx = !!dtx;
    // Opus in-band FEC (forward error correction): same fmtp-line mechanism
    // class as DTX above, negotiated via `useinbandfec=1` rather than an
    // RTCRtpEncodingParameters field. Materially improves perceived audio
    // quality on lossy connections by letting the decoder reconstruct lost
    // packets from redundant data in the following packet, at the cost of a
    // small bitrate overhead — worthwhile default for voice chat.
    this.fec = !!fec;
    // Force-TURN-relay toggle: when true, new peer connections are constrained
    // to iceTransportPolicy 'relay' (candidates limited to TURN), trading direct-path
    // latency for IP-address privacy from other participants. Live-settable via
    // setForceRelay(); like setDtx, only takes effect for new/future connections.
    this.forceRelay = !!forceRelay;
  }

  setForceRelay(on) {
    this.forceRelay = !!on;
    // iceTransportPolicy:'relay' restricts ICE candidate gathering to TURN-sourced
    // relay candidates only -- STUN never produces those, so with no TURN server
    // configured (see DEFAULT_ICE_SERVERS' file-header comment) this setting is a
    // guaranteed, permanent connection failure rather than the "route via relay
    // for IP privacy" behavior it's meant to provide. Warn now, at the point the
    // setting is changed, rather than let it silently doom every future connect().
    if (this.forceRelay && !hasTurnServer()) this._emit('media-warning', { message: 'Force TURN is enabled but no TURN server is configured -- voice connections will fail to establish. Disable Force TURN or configure a TURN server via setIceServers().' });
  }

  // Live-settable: mic-sensitivity threshold used by the speaker-activity poller.
  setMicSensitivity(rms) {
    if (typeof rms !== 'number' || !(rms > 0)) return;
    this.micSensitivity = rms;
  }

  setFec(on) { this.fec = !!on; }

  // Live-settable input-device + processing constraints. Applied on the next
  // getUserMedia call (join or rejoin) — matches the standard "settings apply
  // on reconnect" UX pattern also used by setAudioQuality/setDtx; no live
  // renegotiation of an already-open mic track is attempted.
  setAudioConstraints({ deviceId, noiseSuppression, autoGainControl, echoCancellation } = {}) {
    if (deviceId !== undefined) this.deviceId = deviceId || null;
    if (noiseSuppression !== undefined) this.noiseSuppression = !!noiseSuppression;
    if (autoGainControl !== undefined) this.autoGainControl = !!autoGainControl;
    if (echoCancellation !== undefined) this.echoCancellation = !!echoCancellation;
  }

  // Live-settable: push-to-talk vs open-mic mode. Does not itself mute/unmute —
  // it changes what connect() defaults to and what releaseTransmit() restores to.
  setPttMode(on) { this.pttMode = !!on; }

  // Live-settable: Opus target bitrate tier. Re-applies immediately to every
  // connected peer's audio sender via the same setParameters() path _applyAudioHints
  // uses, so a mid-call quality change actually reaches the wire.
  setAudioQuality(tier) {
    const kbps = OPUS_BITRATE_LADDER[tier];
    this.audioQuality = kbps ? tier : DEFAULT_AUDIO_QUALITY;
    this._targetBitrate = kbps || OPUS_BITRATE_LADDER[DEFAULT_AUDIO_QUALITY];
    for (const [, peer] of this.peers) if (peer.pc) this._applyAudioHints(peer.pc);
  }

  // Live-settable: DTX (silence suppression) toggle. Re-negotiation of an
  // already-open connection isn't forced (that would require a fresh offer/answer);
  // it takes effect on the next SDP exchange (offer, answer, or ICE restart) for
  // open peers, and immediately for any new connection.
  setDtx(on) { this.dtx = !!on; }

  _initActor() {
    this.actor = this.xstate.createActor(this.fsm.voiceMachine);
    this.actor.subscribe((snap) => this.dispatchEvent(new CustomEvent('state', { detail: { value: snap.value } })));
    this.actor.start();
  }

  // Reentrancy guard: connect()/disconnect() are async and mutate shared
  // instance state (peers, participants, localStream, roomId) across several
  // await points. Rapid join→leave→rejoin (or a double-click join) used to
  // interleave two in-flight calls: a stale connect() resuming after a newer
  // disconnect() had already torn everything down would re-populate roomId/
  // participants and re-send 'connected' into an actor the fresh call had
  // already returned to idle, leaking the stale heartbeat/presence
  // subscriptions and getUserMedia stream. Every call captures the epoch at
  // entry and re-checks it after each await; a superseded call unwinds
  // whatever it acquired instead of mutating shared state.
  async connect(channelName, { displayName = 'Guest' } = {}) {
    if (!this.actor) this._initActor();
    if (!this.actor.getSnapshot().can({ type: 'connect' })) await this.disconnect();
    const epoch = ++this._epoch;
    this.actor.send({ type: 'connect' });
    this.channelName = channelName;
    this.joinTs = Math.floor(Date.now() / 1000);
    this.displayName = displayName;
    try {
      const roomId = await deriveRoomId(this.serverId, channelName);
      if (epoch !== this._epoch) return;
      // No mic (denied permission, no device, or a headless/kiosk browser) must not block
      // joining voice — downstream code already null-guards localStream throughout (mute
      // toggle, recording, peer transceivers fall back to recvonly), so a mic-less join is
      // a supported listen-only mode, not a degraded error state.
      let stream = null;
      try {
        stream = await this.md.getUserMedia({ audio: {
          echoCancellation: this.echoCancellation, noiseSuppression: this.noiseSuppression, autoGainControl: this.autoGainControl,
          ...(this.deviceId ? { deviceId: { exact: this.deviceId } } : {})
        } });
      } catch (mediaErr) {
        this._emit('media-warning', { message: 'joined listen-only: ' + mediaErr.message });
      }
      if (epoch !== this._epoch) { if (stream) stream.getTracks().forEach(t => t.stop()); return; }
      this.roomId = roomId;
      this.localStream = stream;
      // PTT mode: gate closed at join, caller opens it via setMuted(false)/requestTransmit().
      // Open-mic mode (pttMode=false): start unmuted.
      this.muted = this.pttMode;
      if (this.localStream) this.localStream.getAudioTracks().forEach(t => t.enabled = !this.pttMode);
      this.participants.clear();
      this.participants.set('local', { identity: displayName, isSpeaking: false, isMuted: this.pttMode, isLocal: true, hasVideo: false, connectionQuality: 'good' });
      // Local speaker-activity detection needs to keep listening even while muted
      // (VAD mode auto-unmutes ON speech, so it can't rely on the transmit-gated
      // track to hear that speech in the first place). Clone the raw audio track
      // — a clone's `enabled` is independent of the original ONCE SET, but
      // MediaStreamTrack.clone() inherits the source's CURRENT enabled state at
      // clone time (confirmed live: track.enabled=false then .clone() produces an
      // already-disabled clone, not a fresh enabled:true one) — so cloning after
      // line above sets the original to !pttMode (false in the default PTT-starts-
      // muted case) previously born the clone already silenced, permanently, since
      // nothing else ever touches it. Force enabled=true explicitly right after
      // cloning, independent of the original's state, so local analysis never goes
      // silent regardless of clone-order or mute state; it is never sent to peers.
      if (this.localStream) {
        const track = this.localStream.getAudioTracks()[0];
        this._localListenTrack = track ? track.clone() : null;
        if (this._localListenTrack) this._localListenTrack.enabled = true;
        const listenStream = this._localListenTrack ? new MediaStream([this._localListenTrack]) : this.localStream;
        this._attachAnalyzer('local', listenStream);
      }
      this.actor.send({ type: 'connected' });
      this._subscribeSignals();
      this._subscribePresence();
      await this._publishPresence('join');
      if (epoch !== this._epoch) return;
      this._startHeartbeat();
      this._sfuStart();
      this._subscribeBanEnforcement();
      this._emit('connected', { roomId: this.roomId, channelName });
    } catch (e) {
      if (epoch !== this._epoch) return;
      this.actor.send({ type: 'fail' });
      this._emit('error', { message: 'connect failed: ' + e.message });
      throw e;
    }
  }

  async disconnect() {
    if (!this.actor || this.actor.getSnapshot().matches('idle')) return;
    if (!this.actor.getSnapshot().can({ type: 'disconnect' })) return;
    ++this._epoch;
    this.actor.send({ type: 'disconnect' });
    await this._publishPresence('leave');
    this._stopHeartbeat();
    this._sfuStop();
    for (const pk of Array.from(this.peers.keys())) this._closePeer(pk);
    this.peers.clear();
    for (const pk of Object.keys(this.retrySchedule)) this._cancelReconnect(pk);
    if (this._activityTimer) { clearInterval(this._activityTimer); this._activityTimer = null; }
    if (this._activeAnalyzers) { for (const k of Array.from(this._activeAnalyzers.keys())) this._detachAnalyzer(k); }
    if (this._outboundRec) { try { this._outboundRec.rec.stop(); } catch {} this._outboundRec = null; }
    if (this._actx && this._actx.state !== 'closed') { try { this._actx.close(); } catch {} this._actx = null; }
    if (this.cameraStream) { this.cameraStream.getTracks().forEach(t => t.stop()); this.cameraStream = null; }
    if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
    if (this._localListenTrack) { this._localListenTrack.stop(); this._localListenTrack = null; }
    if (this.roomId) { this.pool.unsubscribe('voice-presence-' + this.roomId); this.pool.unsubscribe('voice-signals-' + this.roomId); }
    this._unsubscribeBanEnforcement();
    this.participants.clear();
    this.roomId = ''; this.channelName = '';
    this.muted = false; this.deafened = false;
    this.actor.send({ type: 'done' });
    this._emit('disconnected', {});
  }

  toggleMic() { return this.setMuted(!this.muted); }

  // setMuted is the canonical API. PTT layers should call setMuted(false) on
  // hold-start and setMuted(true) on hold-end. Anti-overtalk lives below as
  // requestTransmit / releaseTransmit which gate the unmute on remote silence.
  setMuted(want) {
    const next = !!want;
    if (this.muted === next) return;
    this.muted = next;
    if (this.localStream) this.localStream.getAudioTracks().forEach(t => t.enabled = !this.muted);
    // Defensive re-assert: _localListenTrack must never be silenced by mute state
    // (see connect()'s own comment on why) -- this setter never intentionally
    // touches it, but re-asserting here costs nothing and makes the invariant
    // self-healing rather than solely dependent on connect()'s one-time clone-order fix.
    if (this._localListenTrack) this._localListenTrack.enabled = true;
    const local = this.participants.get('local'); if (local) local.isMuted = this.muted;
    if (this.muted) this._localActivityClear();
    this._emit('mic', { muted: this.muted });
    this._emit('participants', { list: this.getParticipants() });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Speaker-activity detection
  // Each peer stream + the local stream gets a Web Audio analyser. We poll
  // the rms and flip participant.isSpeaking with hysteresis so the rest of
  // the app (including the queue layer) can react.
  // ────────────────────────────────────────────────────────────────────────
  _ensureAudioCtx() {
    if (this._actx && this._actx.state !== 'closed') return this._actx;
    const Ctx = (typeof AudioContext !== 'undefined') ? AudioContext : (typeof webkitAudioContext !== 'undefined') ? webkitAudioContext : null;
    if (!Ctx) return null;
    this._actx = new Ctx();
    this._activeAnalyzers = new Map();   // key → { node, source, lastActive, gainNode? }
    this._mixedDest = this._actx.createMediaStreamDestination();
    this._mixedGain = this._actx.createGain();
    this._mixedGain.gain.value = 1.0;
    this._mixedGain.connect(this._mixedDest);
    if (!this._activityTimer) this._activityTimer = setInterval(() => this._pollActivity(), SPEAKER_POLL_MS);
    return this._actx;
  }

  _attachAnalyzer(key, stream, { tap = false } = {}) {
    const ctx = this._ensureAudioCtx(); if (!ctx || !stream) return;
    if (this._activeAnalyzers.has(key)) return;
    try {
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.4;
      src.connect(an);
      let tapNode = null;
      if (tap) { tapNode = ctx.createGain(); tapNode.gain.value = 1.0; src.connect(tapNode); tapNode.connect(this._mixedGain); }
      this._activeAnalyzers.set(key, { src, an, tapNode, lastActive: 0, speaking: false });
    } catch {}
  }

  _detachAnalyzer(key) {
    const a = this._activeAnalyzers?.get(key); if (!a) return;
    try { a.tapNode?.disconnect(); } catch {}
    try { a.an?.disconnect(); } catch {}
    try { a.src?.disconnect(); } catch {}
    this._activeAnalyzers.delete(key);
    this._setSpeaking(key, false);
  }

  _pollActivity() {
    if (!this._activeAnalyzers || !this._activeAnalyzers.size) return;
    const buf = new Uint8Array(256);
    const now = Date.now();
    for (const [key, a] of this._activeAnalyzers) {
      a.an.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      const active = rms > this.micSensitivity;
      if (active) a.lastActive = now;
      const stillSpeaking = active || (now - a.lastActive) < SPEAKER_HOLD_MS;
      if (stillSpeaking !== a.speaking) { a.speaking = stillSpeaking; this._setSpeaking(key, stillSpeaking); }
      if (key === 'local') {
        // Normalized 0-1 level for a live VAD meter UI, distinct from the speaking
        // boolean above -- LEVEL_METER_CEILING is an empirical loud-speech RMS
        // ceiling (raw RMS rarely exceeds ~0.3-0.4 even shouting close to a mic),
        // not a physical constant; scaling against it keeps normal speech visible
        // in the meter instead of pinned near the bottom of a 0-1 bar.
        const level = Math.max(0, Math.min(1, rms / LEVEL_METER_CEILING));
        this._emit('local-level', { level, rms });
      }
    }
    this._maybeAutoTransmit();
  }

  _setSpeaking(key, val) {
    const isLocal = key === 'local';
    if (isLocal) {
      const p = this.participants.get('local'); if (p && p.isSpeaking !== val) { p.isSpeaking = val; this._emit('participants', { list: this.getParticipants() }); this._emit('speaker', { key: 'local', isLocal: true, speaking: val }); }
    } else {
      const shortId = 'nostr-' + key.slice(0, 12);
      const p = this.participants.get(shortId);
      if (p && p.isSpeaking !== val) { p.isSpeaking = val; this._emit('participants', { list: this.getParticipants() }); this._emit('speaker', { key, isLocal: false, speaking: val }); }
    }
  }

  _localActivityClear() {
    const a = this._activeAnalyzers?.get('local'); if (a) { a.lastActive = 0; if (a.speaking) { a.speaking = false; this._setSpeaking('local', false); } }
  }

  anyRemoteSpeaking() {
    if (!this._activeAnalyzers) return false;
    for (const [k, a] of this._activeAnalyzers) if (k !== 'local' && a.speaking) return true;
    return false;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Anti-overtalk transmit gate
  // requestTransmit() — opens the mic if the channel is clear; otherwise starts
  //   buffering into a local segment. releaseTransmit() finalizes / closes.
  // The buffered segment is then published via per-peer data channel as the
  // outbound queue to peers (they playback when their inbound channel drains).
  // ────────────────────────────────────────────────────────────────────────
  requestTransmit() {
    if (!this.localStream) { this._emit('transmit-denied', { reason: 'no-microphone' }); return false; }
    this._wantsTransmit = true;
    if (!this.anyRemoteSpeaking()) { this.setMuted(false); this._emit('transmit', { mode: 'live' }); return true; }
    // remote busy → buffer locally
    this._beginOutboundCapture();
    this._emit('transmit', { mode: 'queued' });
    return false;
  }

  releaseTransmit() {
    this._wantsTransmit = false;
    if (this._outboundRec) this._finalizeOutboundCapture();
    // Only re-close the gate in PTT mode. In open-mic mode there is no "release"
    // to fall back to — the mic stays live per pttMode's own semantics.
    if (this.pttMode && !this.muted) this.setMuted(true);
    this._emit('transmit', { mode: 'idle' });
  }

  _maybeAutoTransmit() {
    if (!this._wantsTransmit) return;
    // If we're queued AND remote is now silent, flip to live and finalize the held segment
    if (this._outboundRec && !this.anyRemoteSpeaking()) {
      this._finalizeOutboundCapture();
      this.setMuted(false);
      this._emit('transmit', { mode: 'live' });
    }
    // If we're live AND a remote starts speaking, fall back to queued mode
    else if (!this.muted && this.anyRemoteSpeaking()) {
      this.setMuted(true);
      this._beginOutboundCapture();
      this._emit('transmit', { mode: 'queued' });
    }
  }

  _pickMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    for (const m of QUEUE_MIME_PREFS) if (MediaRecorder.isTypeSupported(m)) return m;
    return '';
  }

  _beginOutboundCapture() {
    if (this._outboundRec || !this.localStream) return;
    const mime = this._pickMime(); if (mime === null) return;
    const segId = (this.auth.pubkey?.slice(0, 8) || 'me') + '-' + Date.now();
    const chunks = [];
    let rec;
    try { rec = new MediaRecorder(this.localStream, mime ? { mimeType: mime } : undefined); } catch { return; }
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(250);
    this._outboundRec = { rec, chunks, segId, mime: mime || rec.mimeType, ts: Date.now(), capLimit: setTimeout(() => this._finalizeOutboundCapture(), QUEUE_MAX_SEGMENT_MS) };
    this._emit('segment-start', { kind: 'outbound', segId });
  }

  async _finalizeOutboundCapture() {
    const o = this._outboundRec; if (!o) return;
    this._outboundRec = null;
    clearTimeout(o.capLimit);
    if (o.rec.state !== 'inactive') {
      const stopped = new Promise(r => o.rec.onstop = r);
      try { o.rec.stop(); } catch {}
      await stopped;
    }
    if (!o.chunks.length) return;
    const blob = new Blob(o.chunks, { type: o.mime });
    const buf = new Uint8Array(await blob.arrayBuffer());
    const segment = { id: o.segId, from: this.auth.pubkey, name: this.displayName || 'Me', mime: o.mime, ts: o.ts, dur: Date.now() - o.ts, bytes: buf };
    this._emit('segment-finalized', { kind: 'outbound', segment });
    this._broadcastSegment(segment);
  }

  // ────────────────────────────────────────────────────────────────────────
  // Per-peer data channel — segment broadcast
  // ────────────────────────────────────────────────────────────────────────
  _ensureDataChannel(peer, peerPubkey, isOfferer) {
    if (peer.dc) return;
    if (isOfferer) {
      try {
        const dc = peer.pc.createDataChannel(DC_LABEL, { ordered: true });
        peer.dc = dc; this._wireDataChannel(dc, peer, peerPubkey);
      } catch {}
    } else {
      peer.pc.ondatachannel = (ev) => { if (ev.channel.label === DC_LABEL) { peer.dc = ev.channel; this._wireDataChannel(peer.dc, peer, peerPubkey); } };
    }
  }

  _wireDataChannel(dc, peer, peerPubkey) {
    dc.binaryType = 'arraybuffer';
    peer._dcInbox = new Map(); // segId → { meta, parts:[], received:0, total:0 }
    dc.onmessage = (e) => this._dcOnMessage(e.data, peer, peerPubkey);
    dc.onopen = () => this._emit('dc-open', { peerPubkey });
    dc.onclose = () => this._emit('dc-close', { peerPubkey });
  }

  _dcSendJSON(peer, obj) {
    if (!peer.dc || peer.dc.readyState !== 'open') return false;
    try { peer.dc.send(DC_HEADER + 'J' + JSON.stringify(obj)); return true; } catch { return false; }
  }
  _dcSendBytes(peer, segId, idx, total, bytes) {
    if (!peer.dc || peer.dc.readyState !== 'open') return false;
    const head = new TextEncoder().encode(DC_HEADER + 'B' + segId + ':' + idx + '/' + total + ':');
    const buf = new Uint8Array(head.length + bytes.length);
    buf.set(head, 0); buf.set(bytes, head.length);
    try { peer.dc.send(buf.buffer); return true; } catch { return false; }
  }

  async _broadcastSegment(seg) {
    const open = [];
    for (const [pk, peer] of this.peers) if (peer.dc?.readyState === 'open') open.push([pk, peer]);
    if (!open.length) return;
    const meta = { type: 'seg-meta', segId: seg.id, from: seg.from, name: seg.name, mime: seg.mime, ts: seg.ts, dur: seg.dur, total: Math.ceil(seg.bytes.length / DC_CHUNK_MAX), bytes: seg.bytes.length };
    for (const [, peer] of open) this._dcSendJSON(peer, meta);
    let idx = 0;
    for (let off = 0; off < seg.bytes.length; off += DC_CHUNK_MAX, idx++) {
      const slice = seg.bytes.subarray(off, Math.min(off + DC_CHUNK_MAX, seg.bytes.length));
      for (const [, peer] of open) this._dcSendBytes(peer, seg.id, idx, meta.total, slice);
    }
    for (const [, peer] of open) this._dcSendJSON(peer, { type: 'seg-end', segId: seg.id });
  }

  _dcOnMessage(data, peer, peerPubkey) {
    if (typeof data === 'string') {
      if (!data.startsWith(DC_HEADER)) return;
      const tag = data[3]; const body = data.slice(4);
      if (tag !== 'J') return;
      let obj; try { obj = JSON.parse(body); } catch { return; }
      if (obj.type === 'seg-meta') {
        peer._dcInbox.set(obj.segId, { meta: obj, parts: new Array(obj.total), received: 0 });
      } else if (obj.type === 'seg-end') {
        const inbox = peer._dcInbox.get(obj.segId); if (!inbox) return;
        peer._dcInbox.delete(obj.segId);
        if (inbox.received < inbox.meta.total) return; // dropped
        const total = inbox.parts.reduce((n, p) => n + (p?.length || 0), 0);
        const buf = new Uint8Array(total); let off = 0;
        for (const p of inbox.parts) { buf.set(p, off); off += p.length; }
        const segment = { id: inbox.meta.segId, from: inbox.meta.from || peerPubkey, name: inbox.meta.name, mime: inbox.meta.mime, ts: inbox.meta.ts, dur: inbox.meta.dur, bytes: buf };
        this._emit('segment-received', { kind: 'inbound', from: peerPubkey, segment });
      }
      return;
    }
    // binary chunk
    const view = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
    if (view.length < 6) return;
    if (view[0] !== 0x57 || view[1] !== 0x57 || view[2] !== 0x31) return; // 'WW1'
    if (view[3] !== 0x42) return; // 'B'
    let h = 4; let colons = 0; let metaEnd = -1;
    for (; h < view.length && h < 80; h++) {
      if (view[h] === 0x3A) { colons++; if (colons === 2) { metaEnd = h; break; } }
    }
    if (metaEnd < 0) return;
    const headerStr = new TextDecoder().decode(view.subarray(4, metaEnd));
    // segId:idx/total
    const [segId, rest] = headerStr.split(':');
    const [idxStr, totalStr] = rest.split('/');
    const idx = +idxStr, total = +totalStr;
    const inbox = peer._dcInbox.get(segId); if (!inbox) return;
    if (!inbox.parts[idx]) { inbox.parts[idx] = view.subarray(metaEnd + 1); inbox.received++; }
  }

  toggleDeafen() {
    this.deafened = !this.deafened;
    for (const [, peer] of this.peers) if (peer.audioEl) peer.audioEl.muted = this.deafened;
    this._emit('deafen', { deafened: this.deafened });
  }

  getParticipants() { return Array.from(this.participants.values()); }

  async _publishPresence(action) {
    if (!this.auth.isLoggedIn() || !this.roomId) return;
    const isHb = action === 'heartbeat';
    const rttScores = isHb ? this._rttScores() : {};
    const capScores = isHb ? this._capScores() : {};
    const reflexive = isHb ? this._reflexiveAddrs() : [];
    const uplinkKbps = isHb ? this._estimateUplinkKbps() : 0;
    const signed = await this.auth.sign({
      kind: 30078, created_at: Math.floor(Date.now() / 1000),
      tags: [['d', 'zellous-voice:' + this.roomId], ['action', action], ['channel', this.channelName], ['server', this.serverId]],
      content: JSON.stringify({ action, name: this.displayName, channel: this.channelName, ts: Date.now(), rttScores, capScores, reflexive, uplinkKbps })
    });
    this.pool.publish(signed);
  }

  // Estimated uplink in kbps: max(availableOutgoingBitrate over connected peers).
  // This is the dominant signal for hub-fitness — hub fan-out is bounded by uplink.
  _estimateUplinkKbps() {
    let best = 0;
    for (const [, peer] of this.peers) {
      if (!peer.pc || peer.pc.connectionState !== 'connected') continue;
      const v = peer._lastAvailOutKbps || 0;
      if (v > best) best = v;
    }
    return best;
  }

  // Map peerPubkey → estimated kbps (most-recent stats sample). Pushed in heartbeat
  // so other nodes can rank us as a hub candidate without their own stats poll.
  _capScores() {
    const out = {};
    for (const [pk, peer] of this.peers) {
      if (peer._lastAvailOutKbps != null) out[pk] = peer._lastAvailOutKbps;
    }
    return out;
  }

  // Recent successful local public reflexive addresses (host:port) we've seen on
  // candidate pairs. Other peers can synth peer-reflexive ICE candidates from these
  // and start probing without waiting for STUN, dramatically cutting join time.
  _reflexiveAddrs() {
    return this._lastReflexive ? [this._lastReflexive] : [];
  }

  _startHeartbeat() { this._stopHeartbeat(); this.heartbeat = setInterval(() => { if (this.actor?.getSnapshot().matches('connected')) this._publishPresence('heartbeat'); }, HEARTBEAT); }
  _stopHeartbeat() { if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; } }

  _subscribePresence() {
    this.pool.subscribe('voice-presence-' + this.roomId,
      [{ kinds: [30078], '#d': ['zellous-voice:' + this.roomId] }],
      (event) => this._onPresence(event));
  }

  // bans.js publishes ban/timeout/kick as fire-and-forget kind:30078 events with
  // no direct reach into an already-open WebRTC connection -- _maybeConnect's
  // isBanned/isTimedOut gate only stops a *future* connection attempt. Without
  // this, a moderation action taken against someone already in the call has zero
  // effect until they happen to disconnect and try to rejoin. Mirrors bans.js's
  // own 'updated' event (fired after every ban/unban/timeout/kick it observes)
  // to close the live peer connection (or self-disconnect, for a kick/ban
  // targeting this client) the moment the action lands.
  _subscribeBanEnforcement() {
    if (!this.bans || this._banEnforceHandler) return;
    this._banEnforceHandler = () => this._enforceBans();
    this.bans.addEventListener('updated', this._banEnforceHandler);
  }

  _unsubscribeBanEnforcement() {
    if (this._banEnforceHandler) { this.bans?.removeEventListener('updated', this._banEnforceHandler); this._banEnforceHandler = null; }
  }

  _enforceBans() {
    if (!this.bans || !this.serverId) return;
    const selfBlocked = this.bans.isBanned(this.serverId, this.auth.pubkey) || this.bans.isTimedOut(this.serverId, this.auth.pubkey) || this.bans.isKicked?.(this.serverId, this.auth.pubkey);
    if (selfBlocked) { this.disconnect(); return; }
    for (const pk of Array.from(this.peers.keys())) {
      if (this.bans.isBanned(this.serverId, pk) || this.bans.isTimedOut(this.serverId, pk) || this.bans.isKicked?.(this.serverId, pk)) this._closePeer(pk);
    }
  }

  _onPresence(event) {
    if (event.pubkey === this.auth.pubkey) return;
    let data; try { data = JSON.parse(event.content); } catch { return; }
    if (Date.now() - (data.ts || 0) > PRESENCE_EXPIRY) return;
    const shortId = 'nostr-' + event.pubkey.slice(0, 12);
    if (data.rttScores) this.sfu.rttMatrix.set(event.pubkey, data.rttScores);
    if (data.capScores || data.uplinkKbps != null) {
      if (!this.sfu.capacityMatrix) this.sfu.capacityMatrix = new Map();
      this.sfu.capacityMatrix.set(event.pubkey, { ...(data.capScores || {}), _self: data.uplinkKbps || 0 });
    }
    if (data.reflexive && Array.isArray(data.reflexive) && data.reflexive.length) {
      if (!this.sfu.reflexiveByPeer) this.sfu.reflexiveByPeer = new Map();
      this.sfu.reflexiveByPeer.set(event.pubkey, data.reflexive);
    }
    if (data.action === 'leave') {
      this.participants.delete(shortId);
      this.sfu.pubkeyByShortId?.delete(shortId);
      this._closePeer(event.pubkey);
      if (this.sfu.hub === event.pubkey) this._sfuOnHubLost();
    }
    else if (!this.participants.has(shortId)) {
      this.participants.set(shortId, { identity: data.name || event.pubkey.slice(0, 8), isSpeaking: false, isMuted: false, isLocal: false, hasVideo: false, connectionQuality: 'connecting' });
      if (this.sfu.pubkeyByShortId) this.sfu.pubkeyByShortId.set(shortId, event.pubkey);
      this._sfuMaybeElect();
      this._maybeConnect(event.pubkey);
    } else {
      if (this.sfu.pubkeyByShortId && !this.sfu.pubkeyByShortId.has(shortId)) this.sfu.pubkeyByShortId.set(shortId, event.pubkey);
      this._sfuMaybeElect();
      if (this._sfuShouldHaveConnectionTo(event.pubkey) && !this.peers.has(event.pubkey)) this._maybeConnect(event.pubkey);
    }
    this._emit('participants', { list: this.getParticipants() });
  }

  // SFU-only topology: each node holds direct WebRTC PCs only to (a) the elected hub,
  // (b) the warm backup, and (c) every peer if WE are the hub (fan-out). Everyone else
  // is reachable indirectly via the hub's audio fan-out.
  _sfuShouldHaveConnectionTo(peerPubkey) {
    if (this.sfu.hub === this.auth.pubkey) return true; // we are hub → connect to all
    if (peerPubkey === this.sfu.hub) return true;
    if (peerPubkey === this.sfu.warmBackup) return true;
    // Pre-election (no hub yet): connect to the lowest-pubkey peer as bootstrap so
    // we have stats data to publish. Election will reshape immediately.
    if (!this.sfu.hub) return true;
    return false;
  }

  _subscribeSignals() {
    this.pool.subscribe('voice-signals-' + this.roomId,
      [{ kinds: [30078], '#p': [this.auth.pubkey], '#r': [this.roomId] }],
      (event) => this._handleSignal(event));
  }

  _maybeConnect(peerPubkey) {
    if (!peerPubkey || peerPubkey === this.auth.pubkey || this.peers.has(peerPubkey)) return;
    if (this.bans && this.serverId && (this.bans.isBanned?.(this.serverId, peerPubkey) || this.bans.isTimedOut?.(this.serverId, peerPubkey) || this.bans.isKicked?.(this.serverId, peerPubkey))) return;
    // Topology gate: only form WebRTC PCs the SFU layout calls for.
    if (!this._sfuShouldHaveConnectionTo(peerPubkey)) return;
    this._cancelReconnect(peerPubkey);
    const fsmActor = this.xstate.createActor(this.fsm.peerMachine);
    fsmActor.subscribe((snap) => { const p = this.peers.get(peerPubkey); if (p) p.state = snap.value; });
    fsmActor.start();
    const peer = { pc: null, audioEl: null, pendingCandidates: [], bufferedCandidates: [], iceTimer: null, disconnectTimer: null, connectTimer: null, failCount: 0, state: 'new', fsm: fsmActor, _stallInterval: null, remoteDescSet: false, trackEndedRestart: false };
    this.peers.set(peerPubkey, peer);
    // Re-check hasTurnServer() here rather than trust setForceRelay()'s own warning
    // alone -- this is the actual point of consequence (where iceTransportPolicy is
    // set), so it stays correct even if forceRelay is ever set another way (directly
    // via the constructor, a future setter) that bypasses setForceRelay()'s check.
    const relayRequested = this.forceRelay && hasTurnServer();
    const pc = this.createPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: 'max-bundle', iceCandidatePoolSize: 4, iceTransportPolicy: relayRequested ? 'relay' : 'all' });
    peer.pc = pc;
    // Watchdog: if this pc hasn't reached 'connected' within CONNECT_TIMEOUT, force
    // the same recovery path a real 'failed' event would take, instead of relying on
    // a browser state transition that may never come for a peer stuck at 'new'.
    peer.connectTimer = setTimeout(() => {
      peer.connectTimer = null;
      if (pc.connectionState === 'connected') return;
      this._doIceRestart(peer, peerPubkey, fsmActor);
    }, CONNECT_TIMEOUT);
    const isOfferer = this.auth.pubkey > peerPubkey;
    if (isOfferer) {
      if (this.localStream) this.localStream.getTracks().forEach(t => pc.addTransceiver(t, { direction: 'sendrecv', streams: [this.localStream] }));
      else pc.addTransceiver('audio', { direction: 'recvonly' });
    }
    this._wirePeer(peer, peerPubkey, fsmActor, isOfferer);
    // ICE/TURN offload via Nostr: if we already have a heartbeat-published
    // reflexive addr for this peer, queue it to be added the moment remote
    // description lands. Cuts join time vs. waiting for STUN re-gather.
    const known = this.sfu.reflexiveByPeer?.get(peerPubkey);
    if (known && known.length) {
      for (const r of known) {
        if (!r?.addr || !r?.port) continue;
        const proto = (r.protocol || 'udp').toLowerCase();
        const typ = r.type === 'relay' ? 'relay' : 'srflx';
        const sdp = `candidate:0 1 ${proto} 1685987071 ${r.addr} ${r.port} typ ${typ}`;
        peer.bufferedCandidates.push({ candidate: sdp, sdpMid: '0', sdpMLineIndex: 0 });
      }
    }
  }

  _wirePeer(peer, peerPubkey, fsmActor, isOfferer) {
    const pc = peer.pc;
    pc.ontrack = (ev) => {
      if (ev.track.kind === 'video') { this.onVideoTrack?.({ peerPubkey, track: ev.track, stream: ev.streams[0] }); return; }
      this.onAudioTrack?.({ peerPubkey, track: ev.track, stream: ev.streams[0], peer });
      this._attachAnalyzer(peerPubkey, ev.streams[0]);
      try { ev.receiver.playoutDelayHint = 0.02; } catch {}
      ev.track.onended = () => { if (peer.fsm.getSnapshot().matches('connected')) this._doIceRestart(peer, peerPubkey, fsmActor); };
      if (!peer._stallInterval) peer._stallInterval = setInterval(() => this._checkStall(peer, peerPubkey, fsmActor), STALL_CHECK);
    };
    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      const cand = ev.candidate.toJSON();
      // Direct-path candidates (host = LAN, srflx = STUN-mapped, prflx = peer-reflexive) get published
      // immediately so the remote side can begin probing direct pairs without waiting for the full
      // gathering cycle. Relay candidates batch — they're a fallback and don't need millisecond latency.
      const cstr = cand.candidate || '';
      const isDirect = cstr.includes(' typ host') || cstr.includes(' typ srflx') || cstr.includes(' typ prflx');
      if (isDirect) {
        this._publishSignal(peerPubkey, 'ice', [cand]);
        return;
      }
      peer.pendingCandidates.push(cand);
      if (peer.iceTimer) clearTimeout(peer.iceTimer);
      peer.iceTimer = setTimeout(() => { if (peer.pendingCandidates.length) { this._publishSignal(peerPubkey, 'ice', peer.pendingCandidates.splice(0)); peer.iceTimer = null; } }, 100);
    };
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { if (peer.iceTimer) { clearTimeout(peer.iceTimer); peer.iceTimer = null; } if (peer.pendingCandidates.length) this._publishSignal(peerPubkey, 'ice', peer.pendingCandidates.splice(0)); } };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        peer.failCount = 0; this._cancelReconnect(peerPubkey);
        if (fsmActor.getSnapshot().can({ type: 'recv_answer' })) fsmActor.send({ type: 'recv_answer' });
        if (peer.disconnectTimer) { clearTimeout(peer.disconnectTimer); peer.disconnectTimer = null; }
        if (peer.connectTimer) { clearTimeout(peer.connectTimer); peer.connectTimer = null; }
        this._applyAudioHints(pc);
        this._setConnectionQuality(peerPubkey, 'good');
      }
      // Clear connectTimer here too: a pc can go straight 'new' -> 'disconnected' in some
      // browsers without ever reporting 'connected'. Without this, connectTimer and the
      // disconnectTimer armed below would both independently call _doIceRestart on the
      // same peer -- a double-fire that double-increments failCount and can double-send
      // ICE restart offers / double-schedule the close+backoff reconnect.
      if (pc.connectionState === 'disconnected') { if (peer.connectTimer) { clearTimeout(peer.connectTimer); peer.connectTimer = null; } fsmActor.send({ type: 'disconnect' }); peer.disconnectTimer = setTimeout(() => this._doIceRestart(peer, peerPubkey, fsmActor), DISCONNECT_GRACE); this._setConnectionQuality(peerPubkey, 'poor'); }
      if (pc.connectionState === 'failed') this._doIceRestart(peer, peerPubkey, fsmActor);
      if (pc.connectionState === 'closed') { this._closePeer(peerPubkey); if (this.sfu.hub === peerPubkey) this._sfuOnHubLost(); }
      if (pc.connectionState === 'failed' && this.sfu.hub === peerPubkey) this._sfuOnHubLost();
    };
    this._ensureDataChannel(peer, peerPubkey, isOfferer);
    if (isOfferer) {
      fsmActor.send({ type: 'offer' });
      pc.createOffer().then(o => { o.sdp = this._mungeDtx(o.sdp); return pc.setLocalDescription(o).then(() => this._publishSignal(peerPubkey, 'offer', o)); }).catch(() => {});
    }
  }

  // Real DTX (discontinuous transmission / silence suppression) and FEC
  // (forward error correction) toggles. Neither is an RTCRtpEncodingParameters
  // field in the actual WebRTC spec — both are negotiated per the Opus fmtp
  // SDP line (`usedtx=1` / `useinbandfec=1`). This mutates the outgoing SDP's
  // audio m-section fmtp lines for the Opus payload type(s) found via the SDP
  // itself (matches "opus" case-insensitively, same as the codec-preference
  // filter in _applyAudioHints), adding/removing each param independently.
  _mungeDtx(sdp) {
    if (!sdp) return sdp;
    const lines = sdp.split('\r\n');
    const opusPts = new Set();
    for (const line of lines) {
      const m = /^a=rtpmap:(\d+)\s+opus\//i.exec(line);
      if (m) opusPts.add(m[1]);
    }
    if (!opusPts.size) return sdp;
    const out = lines.map(line => {
      const m = /^a=fmtp:(\d+)\s+(.*)$/.exec(line);
      if (!m || !opusPts.has(m[1])) return line;
      const params = m[2].split(';').map(p => p.trim()).filter(p => p && !/^usedtx=/i.test(p) && !/^useinbandfec=/i.test(p));
      if (this.dtx) params.push('usedtx=1');
      if (this.fec) params.push('useinbandfec=1');
      return 'a=fmtp:' + m[1] + ' ' + params.join(';');
    });
    return out.join('\r\n');
  }

  _applyAudioHints(pc) {
    try {
      pc.getSenders().forEach(s => {
        if (!s.track || s.track.kind !== 'audio') return;
        const p = s.getParameters(); if (!p.encodings?.length) return;
        p.encodings[0].networkPriority = 'high';
        // Opus bitrate ladder: real per-tier target set via setAudioQuality(),
        // applied here through the actual RTCRtpSender.setParameters() call.
        p.encodings[0].maxBitrate = this._targetBitrate || OPUS_BITRATE_LADDER[DEFAULT_AUDIO_QUALITY];
        p.encodings[0].priority = 'high';
        s.setParameters(p).catch(() => {});
      });
      pc.getReceivers().forEach(r => { if (r.track?.kind !== 'audio') return; try { r.playoutDelayHint = 0.02; } catch {} });
      // Munge SDP-level Opus params via setCodecPreferences when the transceiver supports it.
      pc.getTransceivers().forEach(t => {
        if (t.receiver?.track?.kind !== 'audio' && t.sender?.track?.kind !== 'audio') return;
        if (typeof RTCRtpSender === 'undefined' || !RTCRtpSender.getCapabilities) return;
        const caps = RTCRtpSender.getCapabilities('audio'); if (!caps?.codecs) return;
        const opus = caps.codecs.filter(c => /opus/i.test(c.mimeType));
        const others = caps.codecs.filter(c => !/opus/i.test(c.mimeType));
        try { t.setCodecPreferences([...opus, ...others]); } catch {}
      });
    } catch {}
  }

  _checkStall(peer, peerPubkey, fsmActor) {
    if (!peer.audioEl?.srcObject || !peer.fsm.getSnapshot().matches('connected') || peer.trackEndedRestart) return;
    const allEnded = peer.audioEl.srcObject.getTracks().every(t => t.readyState === 'ended');
    if (!allEnded) return;
    peer.trackEndedRestart = true;
    this._doIceRestart(peer, peerPubkey, fsmActor);
  }

  _doIceRestart(peer, peerPubkey, fsmActor) {
    const pc = peer.pc;
    if (peer.disconnectTimer) { clearTimeout(peer.disconnectTimer); peer.disconnectTimer = null; }
    if (peer.connectTimer) { clearTimeout(peer.connectTimer); peer.connectTimer = null; }
    peer.failCount++;
    this._setConnectionQuality(peerPubkey, 'poor');
    if (peer.failCount <= 1 && this.auth.pubkey > peerPubkey) {
      fsmActor.send({ type: 'restart' }); pc.restartIce();
      // Re-arm the watchdog for the restarted attempt -- only the offerer retries in
      // place (the answerer branch below closes+reschedules immediately, so there is
      // no live peer/pc left to re-arm a timer against). If this restarted offer also
      // goes unanswered, the same bounded fallback applies again.
      peer.connectTimer = setTimeout(() => {
        peer.connectTimer = null;
        if (pc.connectionState === 'connected') return;
        this._doIceRestart(peer, peerPubkey, fsmActor);
      }, CONNECT_TIMEOUT);
      pc.createOffer({ iceRestart: true }).then(o => { o.sdp = this._mungeDtx(o.sdp); return pc.setLocalDescription(o).then(() => this._publishSignal(peerPubkey, 'offer', o)); }).catch(() => this._closePeer(peerPubkey));
    } else { this._closePeer(peerPubkey); this._scheduleReconnect(peerPubkey, peer.failCount); }
  }

  _handleSignal(event) {
    const from = event.pubkey; if (from === this.auth.pubkey) return;
    let data; try { data = JSON.parse(event.content); } catch { return; }
    if (!data?.type) return;
    if (!this.peers.has(from)) this._maybeConnect(from);
    const peer = this.peers.get(from); if (!peer) return;
    const pc = peer.pc; const fsmActor = peer.fsm;
    const addCands = (cands) => cands.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
    const drainBuf = () => { addCands(peer.bufferedCandidates); peer.bufferedCandidates = []; };
    const doAnswer = async () => {
      if (fsmActor.getSnapshot().can({ type: 'recv_offer' })) fsmActor.send({ type: 'recv_offer' });
      await pc.setRemoteDescription(new RTCSessionDescription(data.data));
      peer.remoteDescSet = true; drainBuf();
      const hasAudioTx = pc.getTransceivers().some(t => t.receiver.track?.kind === 'audio');
      if (!hasAudioTx) pc.addTransceiver('audio', { direction: this.localStream ? 'sendrecv' : 'recvonly' });
      if (this.localStream) { const hasSender = pc.getSenders().some(s => s.track?.kind === 'audio'); if (!hasSender) this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream)); }
      const a = await pc.createAnswer(); a.sdp = this._mungeDtx(a.sdp); await pc.setLocalDescription(a); fsmActor.send({ type: 'sent_answer' }); this._publishSignal(from, 'answer', a);
    };
    if (data.type === 'offer') {
      const polite = this.auth.pubkey < from; const collision = pc.signalingState !== 'stable';
      if (collision && !polite) return;
      if (collision && polite) { pc.setLocalDescription({ type: 'rollback' }).then(doAnswer).catch(() => {}); return; }
      doAnswer().catch(() => {});
    } else if (data.type === 'answer' && pc.signalingState === 'have-local-offer') {
      pc.setRemoteDescription(new RTCSessionDescription(data.data)).then(() => { peer.remoteDescSet = true; drainBuf(); }).catch(() => {});
    } else if (data.type === 'ice') {
      const cands = Array.isArray(data.data) ? data.data : [data.data];
      if (peer.remoteDescSet) addCands(cands); else peer.bufferedCandidates.push(...cands);
    }
  }

  // participants is keyed by shortId ('nostr-' + first 12 hex chars of the
  // full pubkey, see _handlePresence/line ~643), while every WebRTC/timer
  // callback only has the full peerPubkey in scope -- bridge the two
  // keyspaces here rather than inline at each call site. A no-op if the
  // participant already left (shortId deleted) or was never a remote peer.
  _setConnectionQuality(peerPubkey, quality) {
    const shortId = 'nostr-' + peerPubkey.slice(0, 12);
    const p = this.participants.get(shortId);
    if (!p || p.connectionQuality === quality) return;
    p.connectionQuality = quality;
    this._emit('participants', { list: this.getParticipants() });
  }

  async _publishSignal(toPubkey, type, data) {
    if (!this.auth.pubkey || !this.roomId) return;
    const d = 'zellous-rtc:' + this.roomId + ':' + this.auth.pubkey + ':' + toPubkey + ':' + type + ':' + (type === 'ice' ? Date.now() : 'sdp');
    const signed = await this.auth.sign({ kind: 30078, created_at: Math.floor(Date.now() / 1000), tags: [['d', d], ['p', toPubkey], ['r', this.roomId]], content: JSON.stringify({ type, data }) });
    this.pool.publish(signed);
  }

  _closePeer(peerPubkey) {
    const peer = this.peers.get(peerPubkey); if (!peer) return;
    if (peer.iceTimer) clearTimeout(peer.iceTimer);
    if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
    if (peer.connectTimer) clearTimeout(peer.connectTimer);
    if (peer._stallInterval) clearInterval(peer._stallInterval);
    try { peer.dc?.close(); } catch {}
    try { peer.pc?.close(); } catch {}
    if (peer.audioEl) { peer.audioEl.srcObject = null; peer.audioEl.remove(); }
    try { peer.fsm?.stop?.(); } catch {}
    this._detachAnalyzer(peerPubkey);
    this.peers.delete(peerPubkey);
    this._emit('peer-closed', { peerPubkey });
  }

  _cancelReconnect(pk) { const e = this.retrySchedule[pk]; if (e) { clearTimeout(e.timer); delete this.retrySchedule[pk]; } }
  _scheduleReconnect(pk, attempt) {
    const a = attempt || 0;
    if (a >= 6) {
      // Retries genuinely exhausted -- distinct from 'peer-closed' (which also
      // fires on a normal clean leave via _closePeer) so a consumer can tell
      // "gave up after 6 attempts" apart from "they left the call".
      this._setConnectionQuality(pk, 'failed');
      this._emit('peer-connect-failed', { peerPubkey: pk, attempts: a });
      return;
    }
    this._cancelReconnect(pk);
    const timer = setTimeout(() => { delete this.retrySchedule[pk]; if (!this.peers.has(pk) && this.roomId) this._maybeConnect(pk); }, Math.min(2 ** a * 2000, 30000));
    this.retrySchedule[pk] = { attempt: a, timer };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Always-SFU topology
  //
  // No mesh. Exactly one hub at a time, elected by the highest-uplink peer
  // among everyone in the room. Election is driven entirely by Nostr-published
  // heartbeats — every peer sees the same scores and computes the same winner
  // deterministically, so there's no leader-election race. Tiebreaker: highest
  // pubkey. The runner-up is held as a warm backup so hub failure → instant
  // failover (sub-second) instead of full re-negotiation (~5 s).
  //
  // ICE/TURN offload to Nostr: each heartbeat publishes the local node's most
  // recent successful public reflexive address. New joiners use that to synth
  // peer-reflexive ICE candidates immediately, skipping their own STUN gather
  // round-trip. Result: first audio in ~hundreds of ms instead of seconds.
  // ────────────────────────────────────────────────────────────────────────
  _sfuStart() {
    this.sfu.actor = this.xstate.createActor(this.fsm.sfuMachine);
    this.sfu.actor.start();
    this.sfu.warmBackup = null;
    this.sfu.lastSwitch = 0;
    this.sfu.capacityMatrix = new Map();
    this.sfu.reflexiveByPeer = new Map();
    this.sfu.pubkeyByShortId = new Map();
    this._sfuStopStats();
    this.sfu.statsInterval = setInterval(() => this._sfuPoll(), 2500);
  }
  _sfuStop() {
    this._sfuStopStats();
    this.sfu.actor?.send({ type: 'dissolve' });
    this.sfu.hub = null; this.sfu.warmBackup = null;
    this.sfu.rttMatrix.clear();
    this.sfu.capacityMatrix?.clear();
    this.sfu.reflexiveByPeer?.clear();
    this._lastReflexive = null;
  }
  _sfuStopStats() { if (this.sfu.statsInterval) { clearInterval(this.sfu.statsInterval); this.sfu.statsInterval = null; } if (this.sfu.electionTimer) { clearTimeout(this.sfu.electionTimer); this.sfu.electionTimer = null; } }

  async _sfuPoll() {
    const rttScores = {};
    const tasks = [];
    for (const [pk, peer] of this.peers) {
      if (!peer.pc || peer.pc.connectionState !== 'connected') continue;
      tasks.push(peer.pc.getStats().then(stats => {
        let pairRtt = null, availOut = null, lossFrac = 0, reflex = null;
        stats.forEach(r => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated || r.selected)) {
            if (r.currentRoundTripTime != null) pairRtt = r.currentRoundTripTime;
            if (r.availableOutgoingBitrate != null) availOut = r.availableOutgoingBitrate;
            // Capture the local end of the selected pair as our public reflexive addr.
            const localId = r.localCandidateId; if (localId) {
              const local = stats.get?.(localId); if (local && (local.candidateType === 'srflx' || local.candidateType === 'prflx' || local.candidateType === 'relay')) {
                reflex = { addr: local.address || local.ip, port: local.port, type: local.candidateType, protocol: local.protocol };
              }
            }
          }
          if (r.type === 'remote-inbound-rtp' && r.kind === 'audio' && r.fractionLost != null) {
            lossFrac = Math.max(lossFrac, r.fractionLost);
          }
        });
        if (pairRtt != null) rttScores[pk] = Math.round(pairRtt * 1000);
        // Per-peer capacity estimate — falls back to RTT/loss heuristic when
        // availableOutgoingBitrate isn't exposed (Firefox, Safari sometimes).
        let capKbps = null;
        if (availOut != null && availOut > 0) capKbps = Math.round(availOut / 1000);
        else if (pairRtt != null) {
          const rttMs = pairRtt * 1000;
          capKbps = Math.round(2000 * Math.max(0, 1 - rttMs / 400) * Math.max(0, 1 - lossFrac * 4));
        }
        if (capKbps != null) peer._lastAvailOutKbps = capKbps;
        if (reflex && reflex.addr && reflex.port) this._lastReflexive = reflex;
      }).catch(() => {}));
    }
    await Promise.all(tasks);
    this.sfu.rttMatrix.set(this.auth.pubkey, rttScores);
    this._sfuMaybeElect();
  }

  _sfuMaybeElect() {
    if (this.sfu.electionTimer) return;
    this.sfu.electionTimer = setTimeout(() => { this.sfu.electionTimer = null; this._sfuElect(); }, 600);
  }

  _sfuRankCandidates() {
    // Score every known participant (including self). Higher = better hub.
    //   capacity term — published uplinkKbps from heartbeats (or local stats for self)
    //   rtt term       — inverse mean RTT, tiebreaker
    //   coverage term  — how many peers we have data on (favours nodes already
    //                    talking to many others, reduces reorg churn)
    const all = new Set([this.auth.pubkey, ...this.participants.keys()]);
    // participants.keys() are shortIds; rebuild full pubkeys from peers + self.
    all.clear(); all.add(this.auth.pubkey);
    for (const pk of this.peers.keys()) all.add(pk);
    if (this.sfu.capacityMatrix) for (const pk of this.sfu.capacityMatrix.keys()) all.add(pk);
    if (this.sfu.rttMatrix) for (const pk of this.sfu.rttMatrix.keys()) all.add(pk);

    const ranked = [];
    for (const pk of all) {
      // Self-uplink: from local stats. Remote uplink: from their heartbeat (_self field).
      let uplink = 0;
      if (pk === this.auth.pubkey) uplink = this._estimateUplinkKbps();
      else { const cap = this.sfu.capacityMatrix?.get(pk); if (cap && typeof cap._self === 'number') uplink = cap._self; }

      const rtt = this.sfu.rttMatrix.get(pk);
      let rttAvg = Infinity, rttCount = 0;
      if (rtt) { let s = 0; for (const v of Object.values(rtt)) if (typeof v === 'number') { s += v; rttCount++; } if (rttCount) rttAvg = s / rttCount; }

      const cap = this.sfu.capacityMatrix?.get(pk);
      const capCount = cap ? Object.keys(cap).filter(k => k !== '_self').length : 0;

      // Score: uplink dominates (it's the bottleneck for hub fan-out).
      // 1 kbps uplink = 1 point. RTT contributes up to 200 points (preferring <200 ms).
      // Coverage contributes (rttCount + capCount) × 30.
      const rttTerm = rttCount ? Math.max(0, 200 - rttAvg) : 0;
      const coverageTerm = (rttCount + capCount) * 30;
      const score = uplink + rttTerm + coverageTerm;

      ranked.push({ pubkey: pk, score, uplink, rttAvg, capCount });
    }
    // Tiebreak by pubkey for determinism across nodes.
    ranked.sort((a, b) => b.score - a.score || (a.pubkey > b.pubkey ? -1 : 1));
    return ranked;
  }

  _sfuElect() {
    const ranked = this._sfuRankCandidates();
    if (!ranked.length) return;
    const top = ranked[0];
    const runnerUp = ranked[1] || null;

    // Hysteresis: keep incumbent unless challenger is meaningfully better
    // AND we've held the current hub for at least HUB_HYSTERESIS_MS.
    const incumbent = this.sfu.hub;
    if (incumbent) {
      const incEntry = ranked.find(r => r.pubkey === incumbent);
      if (incEntry) {
        const advantage = top.score - incEntry.score;
        const rel = incEntry.score > 0 ? advantage / incEntry.score : Infinity;
        const recent = Date.now() - this.sfu.lastSwitch < HUB_HYSTERESIS_MS;
        if (top.pubkey === incumbent || rel < HUB_REL_ADVANTAGE || recent) {
          // Even if we keep incumbent, refresh warm-backup choice.
          this.sfu.warmBackup = (runnerUp && runnerUp.pubkey !== incumbent) ? runnerUp.pubkey : null;
          this._sfuApplyTopology(incumbent);
          return;
        }
      }
    }

    const previousHub = this.sfu.hub;
    this.sfu.hub = top.pubkey;
    this.sfu.warmBackup = (runnerUp && runnerUp.pubkey !== top.pubkey) ? runnerUp.pubkey : null;
    this.sfu.lastSwitch = Date.now();
    try { this.sfu.actor?.send({ type: 'elect' }); } catch {}
    this.sfu.actor?.send({ type: 'elected' });
    this._emit('hub-changed', { hub: top.pubkey, previous: previousHub, score: top.score, uplink: top.uplink });

    if (top.pubkey === this.auth.pubkey) this._sfuBecomeHub();
    else this._sfuRouteToHub(top.pubkey, previousHub);

    this._sfuApplyTopology(top.pubkey);
  }

  // Reconcile the open WebRTC PCs with the elected topology.
  // - If we are hub: keep PCs to every participant, open new ones for missing peers.
  // - Else: keep PCs only to hub + warm backup.
  _sfuApplyTopology(hubPk) {
    if (hubPk === this.auth.pubkey) {
      // Hub connects to every known participant. Build the pubkey set from
      // every available source — pubkeyByShortId (presence-derived), peers,
      // capacityMatrix, rttMatrix — because at the moment of the very first
      // election the matrices may not be populated yet.
      const known = new Set();
      if (this.sfu.pubkeyByShortId) for (const pk of this.sfu.pubkeyByShortId.values()) known.add(pk);
      for (const pk of this.peers.keys()) known.add(pk);
      for (const pk of this.sfu.capacityMatrix?.keys() || []) known.add(pk);
      for (const pk of this.sfu.rttMatrix.keys()) known.add(pk);
      for (const pk of known) {
        if (pk === this.auth.pubkey) continue;
        if (!this.peers.has(pk)) this._maybeConnect(pk);
      }
      return;
    }
    // Non-hub: drop everyone except hub + warm backup.
    for (const pk of Array.from(this.peers.keys())) {
      if (pk === hubPk) continue;
      if (pk === this.sfu.warmBackup) continue;
      this._closePeer(pk);
    }
    if (!this.peers.has(hubPk)) this._maybeConnect(hubPk);
    if (this.sfu.warmBackup && !this.peers.has(this.sfu.warmBackup)) this._maybeConnect(this.sfu.warmBackup);
  }

  _sfuBecomeHub() {
    // Fan out remote audio receivers to all other peer senders via replaceTrack.
    // This zero-copy forward is the heart of SFU — no transcode, no re-encode,
    // just packet redirection at the RTCPeerConnection layer.
    for (const [srcPk, srcPeer] of this.peers) {
      if (!srcPeer.pc?.getReceivers) continue;
      srcPeer.pc.getReceivers().forEach(recv => {
        if (recv.track?.kind !== 'audio') return;
        for (const [dstPk, dstPeer] of this.peers) {
          if (dstPk === srcPk) continue;
          const sender = dstPeer.pc?.getSenders().find(s => s.track?.kind === 'audio');
          sender?.replaceTrack(recv.track).catch(() => {});
        }
      });
    }
  }

  // Graceful handoff: open new hub PC, wait briefly for first audio, then drop
  // old PCs. The warm backup is preserved through the transition for failover.
  async _sfuRouteToHub(hubPk, previousHub) {
    if (!this.peers.has(hubPk)) this._maybeConnect(hubPk);
    const hubPeer = this.peers.get(hubPk);
    const ok = await new Promise((resolve) => {
      if (!hubPeer) { resolve(false); return; }
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const timer = setTimeout(() => finish(false), 5000);
      const poll = setInterval(() => {
        try {
          const r = hubPeer.pc?.getReceivers().find(x => x.track?.kind === 'audio');
          if (r?.track && r.track.readyState === 'live') { clearTimeout(timer); clearInterval(poll); finish(true); }
        } catch {}
      }, 100);
    });
    if (!ok && previousHub && previousHub !== hubPk && this.participants.size) {
      // Roll back: new hub didn't deliver audio. Keep old hub.
      this.sfu.hub = previousHub;
      if (!this.peers.has(previousHub)) this._maybeConnect(previousHub);
    }
  }

  // Hub-loss handler: wired from peer connectionstatechange when current hub PC dies.
  _sfuOnHubLost() {
    if (!this.sfu.hub) return;
    const hubPeer = this.peers.get(this.sfu.hub);
    if (hubPeer && hubPeer.pc?.connectionState === 'connected') return;
    const promote = this.sfu.warmBackup;
    const lost = this.sfu.hub;
    this.sfu.hub = null;
    if (!promote) { this._sfuMaybeElect(); return; }
    this.sfu.hub = promote;
    this.sfu.warmBackup = null;
    this.sfu.lastSwitch = Date.now();
    try { this.sfu.actor?.send({ type: 'elect' }); } catch {}
    this.sfu.actor?.send({ type: 'elected' });
    this._emit('hub-changed', { hub: promote, previous: lost, reason: 'failover' });
    if (promote === this.auth.pubkey) this._sfuBecomeHub();
    else this._sfuApplyTopology(promote);
  }

  _sfuDissolve() { this.sfu.actor?.send({ type: 'dissolve' }); this.sfu.hubLostAt = Date.now(); this.sfu.hub = null; }

  _rttScores() { return this.sfu.rttMatrix.get(this.auth.pubkey) || {}; }

  debug() {
    const peers = [];
    for (const [pk, peer] of this.peers) peers.push({ pubkey: pk.slice(0, 12), fsmState: peer.fsm?.getSnapshot().value, iceState: peer.pc?.iceConnectionState, connState: peer.pc?.connectionState, candidates: peer.pendingCandidates.length, buffered: peer.bufferedCandidates.length });
    const rttMatrix = {}; for (const [k, v] of this.sfu.rttMatrix) rttMatrix[k.slice(0, 12)] = v;
    return { fsm: this.actor?.getSnapshot().value, peers, participants: this.getParticipants(), sfu: { mode: this.sfu.actor?.getSnapshot().value || 'mesh', hub: this.sfu.hub?.slice(0, 12) || null, rttMatrix }, retrySchedule: this.retrySchedule };
  }

  heal() {
    if (!this.roomId) return;
    const bad = { disconnected: 1, failed: 1, closed: 1 };
    for (const [pk, peer] of this.peers) if (bad[peer.pc?.connectionState]) { this._closePeer(pk); this._scheduleReconnect(pk, 0); }
  }

  _emit(t, d) { this.dispatchEvent(new CustomEvent(t, { detail: d })); }
}

export const createVoiceSession = (opts) => new VoiceSession(opts);
