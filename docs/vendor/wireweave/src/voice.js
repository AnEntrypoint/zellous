const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.nextcloud.com:443' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turns:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' }
];

const PRESENCE_EXPIRY = 300000;
const HEARTBEAT = 30000;
const STALL_CHECK = 5000;
const DISCONNECT_GRACE = 8000;

// Speaker-activity / queue / anti-overtalk tunables
const SPEAKER_ACTIVE_RMS = 0.045;     // RMS threshold above which a stream counts as "speaking"
const SPEAKER_HOLD_MS = 350;          // tail: stay marked speaking this long after last frame > threshold
const SPEAKER_POLL_MS = 80;           // analyzer poll cadence
const QUEUE_MAX_SEGMENT_MS = 30000;   // hard cap per segment
const QUEUE_MIME_PREFS = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
const DC_LABEL = 'wireweave-queue';
const DC_CHUNK_MAX = 14000;           // ~14 KB SCTP-friendly chunks
const DC_HEADER = 'WW1';              // protocol marker

const deriveRoomId = async (serverId, channel) => {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode((serverId || 'default') + ':voice:' + channel));
  return 'zellous' + Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

export class VoiceSession extends EventTarget {
  constructor({ fsm, xstate, relayPool, auth, mediaDevices, bans = null, serverId = '', onAudioTrack = null, onVideoTrack = null }) {
    super();
    if (!fsm || !xstate || !relayPool || !auth || !mediaDevices) throw new Error('VoiceSession: missing deps');
    this.fsm = fsm; this.xstate = xstate; this.pool = relayPool; this.auth = auth; this.md = mediaDevices; this.bans = bans;
    this.serverId = serverId;
    this.onAudioTrack = onAudioTrack; this.onVideoTrack = onVideoTrack;
    this.actor = null;
    this.channelName = ''; this.roomId = '';
    this.peers = new Map(); this.participants = new Map();
    this.localStream = null; this.cameraStream = null;
    this.heartbeat = null; this.joinTs = 0;
    this.muted = false; this.deafened = false;
    this.sfu = { mode: 'mesh', hub: null, hubLostAt: null, rttMatrix: new Map(), electionTimer: null, statsInterval: null, actor: null };
    this.retrySchedule = {};
  }

  _initActor() {
    this.actor = this.xstate.createActor(this.fsm.voiceMachine);
    this.actor.subscribe((snap) => this.dispatchEvent(new CustomEvent('state', { detail: { value: snap.value } })));
    this.actor.start();
  }

  async connect(channelName, { displayName = 'Guest' } = {}) {
    if (!this.actor) this._initActor();
    if (!this.actor.getSnapshot().can({ type: 'connect' })) await this.disconnect();
    this.actor.send({ type: 'connect' });
    this.channelName = channelName;
    this.joinTs = Math.floor(Date.now() / 1000);
    this.displayName = displayName;
    try {
      this.roomId = await deriveRoomId(this.serverId, channelName);
      this.localStream = await this.md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      // PTT default: gate closed at join. Apps that want always-on call setMuted(false).
      this.muted = true;
      this.localStream.getAudioTracks().forEach(t => t.enabled = false);
      this.participants.clear();
      this.participants.set('local', { identity: displayName, isSpeaking: false, isMuted: true, isLocal: true, hasVideo: false, connectionQuality: 'good' });
      this._attachAnalyzer('local', this.localStream);
      this.actor.send({ type: 'connected' });
      this._subscribeSignals();
      this._subscribePresence();
      await this._publishPresence('join');
      this._startHeartbeat();
      this._sfuStart();
      this._emit('connected', { roomId: this.roomId, channelName });
    } catch (e) {
      this.actor.send({ type: 'fail' });
      this._emit('error', { message: 'connect failed: ' + e.message });
      throw e;
    }
  }

  async disconnect() {
    if (!this.actor || this.actor.getSnapshot().matches('idle')) return;
    if (!this.actor.getSnapshot().can({ type: 'disconnect' })) return;
    this.actor.send({ type: 'disconnect' });
    await this._publishPresence('leave');
    this._stopHeartbeat();
    this._sfuStop();
    for (const pk of Array.from(this.peers.keys())) this._closePeer(pk);
    this.peers.clear();
    if (this._activityTimer) { clearInterval(this._activityTimer); this._activityTimer = null; }
    if (this._activeAnalyzers) { for (const k of Array.from(this._activeAnalyzers.keys())) this._detachAnalyzer(k); }
    if (this._outboundRec) { try { this._outboundRec.rec.stop(); } catch {} this._outboundRec = null; }
    if (this._actx && this._actx.state !== 'closed') { try { this._actx.close(); } catch {} this._actx = null; }
    if (this.cameraStream) { this.cameraStream.getTracks().forEach(t => t.stop()); this.cameraStream = null; }
    if (this.localStream) { this.localStream.getTracks().forEach(t => t.stop()); this.localStream = null; }
    if (this.roomId) { this.pool.unsubscribe('voice-presence-' + this.roomId); this.pool.unsubscribe('voice-signals-' + this.roomId); }
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
      const active = rms > SPEAKER_ACTIVE_RMS;
      if (active) a.lastActive = now;
      const stillSpeaking = active || (now - a.lastActive) < SPEAKER_HOLD_MS;
      if (stillSpeaking !== a.speaking) { a.speaking = stillSpeaking; this._setSpeaking(key, stillSpeaking); }
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
    if (!this.localStream) return false;
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
    if (!this.muted) this.setMuted(true);
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
    const rttScores = action === 'heartbeat' ? this._rttScores() : {};
    const signed = await this.auth.sign({
      kind: 30078, created_at: Math.floor(Date.now() / 1000),
      tags: [['d', 'zellous-voice:' + this.roomId], ['action', action], ['channel', this.channelName], ['server', this.serverId]],
      content: JSON.stringify({ action, name: this.displayName, channel: this.channelName, ts: Date.now(), rttScores })
    });
    this.pool.publish(signed);
  }

  _startHeartbeat() { this._stopHeartbeat(); this.heartbeat = setInterval(() => { if (this.actor?.getSnapshot().matches('connected')) this._publishPresence('heartbeat'); }, HEARTBEAT); }
  _stopHeartbeat() { if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; } }

  _subscribePresence() {
    this.pool.subscribe('voice-presence-' + this.roomId,
      [{ kinds: [30078], '#d': ['zellous-voice:' + this.roomId] }],
      (event) => this._onPresence(event));
  }

  _onPresence(event) {
    if (event.pubkey === this.auth.pubkey) return;
    let data; try { data = JSON.parse(event.content); } catch { return; }
    if (Date.now() - (data.ts || 0) > PRESENCE_EXPIRY) return;
    const shortId = 'nostr-' + event.pubkey.slice(0, 12);
    if (data.rttScores) this.sfu.rttMatrix.set(event.pubkey, data.rttScores);
    if (data.action === 'leave') { this.participants.delete(shortId); this._closePeer(event.pubkey); }
    else if (!this.participants.has(shortId)) {
      this.participants.set(shortId, { identity: data.name || event.pubkey.slice(0, 8), isSpeaking: false, isMuted: false, isLocal: false, hasVideo: false, connectionQuality: 'connecting' });
      this._maybeConnect(event.pubkey);
    } else if (!this.peers.has(event.pubkey)) this._maybeConnect(event.pubkey);
    this._emit('participants', { list: this.getParticipants() });
  }

  _subscribeSignals() {
    this.pool.subscribe('voice-signals-' + this.roomId,
      [{ kinds: [30078], '#p': [this.auth.pubkey], '#r': [this.roomId] }],
      (event) => this._handleSignal(event));
  }

  _maybeConnect(peerPubkey) {
    if (!peerPubkey || peerPubkey === this.auth.pubkey || this.peers.has(peerPubkey)) return;
    if (this.bans && this.serverId && (this.bans.isBanned?.(this.serverId, peerPubkey) || this.bans.isTimedOut?.(this.serverId, peerPubkey))) return;
    this._cancelReconnect(peerPubkey);
    const fsmActor = this.xstate.createActor(this.fsm.peerMachine);
    fsmActor.subscribe((snap) => { const p = this.peers.get(peerPubkey); if (p) p.state = snap.value; });
    fsmActor.start();
    const peer = { pc: null, audioEl: null, pendingCandidates: [], bufferedCandidates: [], iceTimer: null, disconnectTimer: null, failCount: 0, state: 'new', fsm: fsmActor, _stallInterval: null, remoteDescSet: false, trackEndedRestart: false };
    this.peers.set(peerPubkey, peer);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS, bundlePolicy: 'max-bundle' });
    peer.pc = pc;
    const isOfferer = this.auth.pubkey > peerPubkey;
    if (isOfferer) {
      if (this.localStream) this.localStream.getTracks().forEach(t => pc.addTransceiver(t, { direction: 'sendrecv', streams: [this.localStream] }));
      else pc.addTransceiver('audio', { direction: 'recvonly' });
    }
    this._wirePeer(peer, peerPubkey, fsmActor, isOfferer);
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
      peer.pendingCandidates.push(ev.candidate.toJSON());
      if (peer.iceTimer) clearTimeout(peer.iceTimer);
      peer.iceTimer = setTimeout(() => { if (peer.pendingCandidates.length) { this._publishSignal(peerPubkey, 'ice', peer.pendingCandidates.splice(0)); peer.iceTimer = null; } }, 500);
    };
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { if (peer.iceTimer) { clearTimeout(peer.iceTimer); peer.iceTimer = null; } if (peer.pendingCandidates.length) this._publishSignal(peerPubkey, 'ice', peer.pendingCandidates.splice(0)); } };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        peer.failCount = 0; this._cancelReconnect(peerPubkey);
        if (fsmActor.getSnapshot().can({ type: 'recv_answer' })) fsmActor.send({ type: 'recv_answer' });
        if (peer.disconnectTimer) { clearTimeout(peer.disconnectTimer); peer.disconnectTimer = null; }
        this._applyAudioHints(pc);
      }
      if (pc.connectionState === 'disconnected') { fsmActor.send({ type: 'disconnect' }); peer.disconnectTimer = setTimeout(() => this._doIceRestart(peer, peerPubkey, fsmActor), DISCONNECT_GRACE); }
      if (pc.connectionState === 'failed') this._doIceRestart(peer, peerPubkey, fsmActor);
      if (pc.connectionState === 'closed') { this._closePeer(peerPubkey); if (this.sfu.hub === peerPubkey) { this._sfuDissolve(); setTimeout(() => this._sfuMaybeElect(), 500); } }
    };
    this._ensureDataChannel(peer, peerPubkey, isOfferer);
    if (isOfferer) {
      fsmActor.send({ type: 'offer' });
      pc.createOffer().then(o => pc.setLocalDescription(o).then(() => this._publishSignal(peerPubkey, 'offer', o))).catch(() => {});
    }
  }

  _applyAudioHints(pc) {
    try {
      pc.getSenders().forEach(s => { if (!s.track || s.track.kind !== 'audio') return; const p = s.getParameters(); if (!p.encodings?.length) return; p.encodings[0].networkPriority = 'high'; p.encodings[0].maxBitrate = 48000; s.setParameters(p).catch(() => {}); });
      pc.getReceivers().forEach(r => { if (r.track?.kind !== 'audio') return; try { r.playoutDelayHint = 0.02; } catch {} });
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
    peer.failCount++;
    if (peer.failCount <= 1 && this.auth.pubkey > peerPubkey) {
      fsmActor.send({ type: 'restart' }); pc.restartIce();
      pc.createOffer({ iceRestart: true }).then(o => pc.setLocalDescription(o).then(() => this._publishSignal(peerPubkey, 'offer', o))).catch(() => this._closePeer(peerPubkey));
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
      const a = await pc.createAnswer(); await pc.setLocalDescription(a); fsmActor.send({ type: 'sent_answer' }); this._publishSignal(from, 'answer', a);
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
    if (peer._stallInterval) clearInterval(peer._stallInterval);
    try { peer.dc?.close(); } catch {}
    try { peer.pc?.close(); } catch {}
    if (peer.audioEl) { peer.audioEl.srcObject = null; peer.audioEl.remove(); }
    this._detachAnalyzer(peerPubkey);
    this.peers.delete(peerPubkey);
    this._emit('peer-closed', { peerPubkey });
  }

  _cancelReconnect(pk) { const e = this.retrySchedule[pk]; if (e) { clearTimeout(e.timer); delete this.retrySchedule[pk]; } }
  _scheduleReconnect(pk, attempt) {
    const a = attempt || 0; if (a >= 6) return;
    this._cancelReconnect(pk);
    const timer = setTimeout(() => { delete this.retrySchedule[pk]; if (!this.peers.has(pk) && this.roomId) this._maybeConnect(pk); }, Math.min(2 ** a * 2000, 30000));
    this.retrySchedule[pk] = { attempt: a, timer };
  }

  _sfuStart() { this.sfu.actor = this.xstate.createActor(this.fsm.sfuMachine); this.sfu.actor.start(); this._sfuStopStats(); this.sfu.statsInterval = setInterval(() => this._sfuPoll(), 5000); }
  _sfuStop() { this._sfuStopStats(); this.sfu.actor?.send({ type: 'dissolve' }); this.sfu.hub = null; this.sfu.rttMatrix.clear(); }
  _sfuStopStats() { if (this.sfu.statsInterval) { clearInterval(this.sfu.statsInterval); this.sfu.statsInterval = null; } if (this.sfu.electionTimer) { clearTimeout(this.sfu.electionTimer); this.sfu.electionTimer = null; } }
  async _sfuPoll() {
    const scores = {}; const tasks = [];
    for (const [pk, peer] of this.peers) {
      if (!peer.pc || peer.pc.connectionState !== 'connected') continue;
      tasks.push(peer.pc.getStats().then(stats => stats.forEach(r => { if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null) scores[pk] = Math.round(r.currentRoundTripTime * 1000); })).catch(() => {}));
    }
    await Promise.all(tasks);
    this.sfu.rttMatrix.set(this.auth.pubkey, scores);
    this._sfuMaybeElect();
  }
  _sfuMaybeElect() {
    if (this.peers.size < 3) { if (this.sfu.actor?.getSnapshot().value !== 'mesh') this._sfuDissolve(); return; }
    if (this.sfu.electionTimer) return;
    this.sfu.electionTimer = setTimeout(() => { this.sfu.electionTimer = null; this._sfuElect(); }, 2000);
  }
  _sfuElect() {
    const all = [this.auth.pubkey]; for (const pk of this.peers.keys()) all.push(pk);
    let best = null, bestAvg = Infinity;
    for (const pk of all) {
      const s = this.sfu.rttMatrix.get(pk); if (!s) continue;
      const vals = Object.values(s).filter(v => typeof v === 'number'); if (!vals.length) continue;
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (avg < bestAvg || (avg === bestAvg && pk > best)) { bestAvg = avg; best = pk; }
    }
    if (!best || best === this.sfu.hub) return;
    this.sfu.hub = best; this.sfu.actor?.send({ type: 'elected' });
    if (best === this.auth.pubkey) this._sfuBecomeHub(); else this._sfuRouteToHub(best);
  }
  _sfuBecomeHub() {
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
  _sfuRouteToHub(hubPk) {
    for (const pk of Array.from(this.peers.keys())) { if (pk === hubPk) continue; this._closePeer(pk); }
    if (!this.peers.has(hubPk)) this._maybeConnect(hubPk);
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
