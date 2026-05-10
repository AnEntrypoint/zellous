const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

const PRESENCE_EXPIRY = 300000;
const HEARTBEAT = 30000;
const DISCONNECT_GRACE = 8000;
const DC_LABEL = 'wireweave-data';

const deriveRoomId = async (namespace, room) => {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode((namespace || 'default') + ':data:' + room));
  return 'wwdata' + Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

export class DataSession extends EventTarget {
  constructor({ fsm, xstate, relayPool, auth, namespace = '', dataChannelOptions = { ordered: true }, iceServers = null }) {
    super();
    if (!fsm || !xstate || !relayPool || !auth) throw new Error('DataSession: missing deps');
    this.fsm = fsm; this.xstate = xstate; this.pool = relayPool; this.auth = auth;
    this.namespace = namespace;
    this.dcOptions = dataChannelOptions;
    this.iceServers = iceServers || ICE_SERVERS;
    this.actor = null;
    this.room = ''; this.roomId = '';
    this.peers = new Map(); this.participants = new Map();
    this.heartbeat = null; this.joinTs = 0;
    this.retrySchedule = {};
    this.displayName = '';
  }

  _initActor() {
    const machine = this.fsm.dataMachine || this.fsm.voiceMachine;
    this.actor = this.xstate.createActor(machine);
    this.actor.subscribe((snap) => this.dispatchEvent(new CustomEvent('state', { detail: { value: snap.value } })));
    this.actor.start();
  }

  async connect(room, { displayName = 'Guest' } = {}) {
    if (!this.actor) this._initActor();
    if (!this.actor.getSnapshot().can({ type: 'connect' })) await this.disconnect();
    this.actor.send({ type: 'connect' });
    this.room = room;
    this.displayName = displayName;
    this.joinTs = Math.floor(Date.now() / 1000);
    try {
      this.roomId = await deriveRoomId(this.namespace, room);
      this.participants.clear();
      this.participants.set('local', { identity: displayName, isLocal: true, connectionQuality: 'good' });
      this.actor.send({ type: 'connected' });
      this._subscribeSignals();
      this._subscribePresence();
      await this._publishPresence('join');
      this._startHeartbeat();
      this._emit('connected', { roomId: this.roomId, room });
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
    for (const pk of Array.from(this.peers.keys())) this._closePeer(pk);
    this.peers.clear();
    if (this.roomId) {
      this.pool.unsubscribe('data-presence-' + this.roomId);
      this.pool.unsubscribe('data-signals-' + this.roomId);
    }
    this.participants.clear();
    this.roomId = ''; this.room = '';
    this.actor.send({ type: 'done' });
    this._emit('disconnected', {});
  }

  send(peerPubkey, payload) {
    const peer = this.peers.get(peerPubkey);
    if (!peer?.dc || peer.dc.readyState !== 'open') return false;
    try { peer.dc.send(payload); return true; } catch { return false; }
  }

  broadcast(payload) {
    let n = 0;
    for (const [, peer] of this.peers) {
      if (peer.dc?.readyState === 'open') {
        try { peer.dc.send(payload); n++; } catch {}
      }
    }
    return n;
  }

  getParticipants() { return Array.from(this.participants.values()); }
  getPeers() { return Array.from(this.peers.keys()); }

  async _publishPresence(action) {
    if (!this.auth.isLoggedIn() || !this.roomId) return;
    const signed = await this.auth.sign({
      kind: 30078, created_at: Math.floor(Date.now() / 1000),
      tags: [['d', 'wireweave-data:' + this.roomId], ['action', action], ['room', this.room], ['ns', this.namespace]],
      content: JSON.stringify({ action, name: this.displayName, room: this.room, ts: Date.now() })
    });
    this.pool.publish(signed);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeat = setInterval(() => { if (this.actor?.getSnapshot().matches('connected')) this._publishPresence('heartbeat'); }, HEARTBEAT);
  }
  _stopHeartbeat() { if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null; } }

  _subscribePresence() {
    this.pool.subscribe('data-presence-' + this.roomId,
      [{ kinds: [30078], '#d': ['wireweave-data:' + this.roomId] }],
      (event) => this._onPresence(event));
  }

  _subscribeSignals() {
    this.pool.subscribe('data-signals-' + this.roomId,
      [{ kinds: [30078], '#p': [this.auth.pubkey], '#r': [this.roomId] }],
      (event) => this._handleSignal(event));
  }

  _onPresence(event) {
    if (event.pubkey === this.auth.pubkey) return;
    let data; try { data = JSON.parse(event.content); } catch { return; }
    if (Date.now() - (data.ts || 0) > PRESENCE_EXPIRY) return;
    const shortId = 'nostr-' + event.pubkey.slice(0, 12);
    if (data.action === 'leave') { this.participants.delete(shortId); this._closePeer(event.pubkey); }
    else if (!this.participants.has(shortId)) {
      this.participants.set(shortId, { identity: data.name || event.pubkey.slice(0, 8), isLocal: false, connectionQuality: 'connecting' });
      this._maybeConnect(event.pubkey);
    } else if (!this.peers.has(event.pubkey)) this._maybeConnect(event.pubkey);
    this._emit('participants', { list: this.getParticipants() });
  }

  _maybeConnect(peerPubkey) {
    if (!peerPubkey || peerPubkey === this.auth.pubkey || this.peers.has(peerPubkey)) return;
    this._cancelReconnect(peerPubkey);
    const fsmActor = this.xstate.createActor(this.fsm.peerMachine);
    fsmActor.subscribe((snap) => { const p = this.peers.get(peerPubkey); if (p) p.state = snap.value; });
    fsmActor.start();
    const peer = { pc: null, dc: null, pendingCandidates: [], bufferedCandidates: [], iceTimer: null, disconnectTimer: null, failCount: 0, state: 'new', fsm: fsmActor, remoteDescSet: false };
    this.peers.set(peerPubkey, peer);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers, bundlePolicy: 'max-bundle' });
    peer.pc = pc;
    const isOfferer = this.auth.pubkey > peerPubkey;
    this._wirePeer(peer, peerPubkey, fsmActor, isOfferer);
  }

  _wirePeer(peer, peerPubkey, fsmActor, isOfferer) {
    const pc = peer.pc;
    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      peer.pendingCandidates.push(ev.candidate.toJSON());
      if (peer.iceTimer) clearTimeout(peer.iceTimer);
      peer.iceTimer = setTimeout(() => { if (peer.pendingCandidates.length) { this._publishSignal(peerPubkey, 'ice', peer.pendingCandidates.splice(0)); peer.iceTimer = null; } }, 500);
    };
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        if (peer.iceTimer) { clearTimeout(peer.iceTimer); peer.iceTimer = null; }
        if (peer.pendingCandidates.length) this._publishSignal(peerPubkey, 'ice', peer.pendingCandidates.splice(0));
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        peer.failCount = 0; this._cancelReconnect(peerPubkey);
        if (fsmActor.getSnapshot().can({ type: 'recv_answer' })) fsmActor.send({ type: 'recv_answer' });
        if (peer.disconnectTimer) { clearTimeout(peer.disconnectTimer); peer.disconnectTimer = null; }
      }
      if (pc.connectionState === 'disconnected') {
        fsmActor.send({ type: 'disconnect' });
        peer.disconnectTimer = setTimeout(() => this._doIceRestart(peer, peerPubkey, fsmActor), DISCONNECT_GRACE);
      }
      if (pc.connectionState === 'failed') this._doIceRestart(peer, peerPubkey, fsmActor);
      if (pc.connectionState === 'closed') this._closePeer(peerPubkey);
    };
    if (isOfferer) {
      try {
        const dc = pc.createDataChannel(DC_LABEL, this.dcOptions);
        peer.dc = dc; this._wireDataChannel(dc, peer, peerPubkey);
      } catch {}
    } else {
      pc.ondatachannel = (ev) => {
        if (ev.channel.label === DC_LABEL) { peer.dc = ev.channel; this._wireDataChannel(peer.dc, peer, peerPubkey); }
      };
    }
    if (isOfferer) {
      fsmActor.send({ type: 'offer' });
      pc.createOffer().then(o => pc.setLocalDescription(o).then(() => this._publishSignal(peerPubkey, 'offer', o))).catch(() => {});
    }
  }

  _wireDataChannel(dc, peer, peerPubkey) {
    dc.binaryType = 'arraybuffer';
    dc.onopen = () => this._emit('peer-open', { peerPubkey });
    dc.onclose = () => this._emit('peer-close', { peerPubkey });
    dc.onmessage = (e) => this._emit('data', { peerPubkey, data: e.data });
    dc.onerror = (e) => this._emit('peer-error', { peerPubkey, error: e });
  }

  _doIceRestart(peer, peerPubkey, fsmActor) {
    const pc = peer.pc;
    if (peer.disconnectTimer) { clearTimeout(peer.disconnectTimer); peer.disconnectTimer = null; }
    peer.failCount++;
    if (peer.failCount <= 1 && this.auth.pubkey > peerPubkey) {
      fsmActor.send({ type: 'restart' }); pc.restartIce();
      pc.createOffer({ iceRestart: true })
        .then(o => pc.setLocalDescription(o).then(() => this._publishSignal(peerPubkey, 'offer', o)))
        .catch(() => this._closePeer(peerPubkey));
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
      const a = await pc.createAnswer(); await pc.setLocalDescription(a);
      fsmActor.send({ type: 'sent_answer' });
      this._publishSignal(from, 'answer', a);
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
    const d = 'wireweave-data-rtc:' + this.roomId + ':' + this.auth.pubkey + ':' + toPubkey + ':' + type + ':' + (type === 'ice' ? Date.now() : 'sdp');
    const signed = await this.auth.sign({
      kind: 30078, created_at: Math.floor(Date.now() / 1000),
      tags: [['d', d], ['p', toPubkey], ['r', this.roomId]],
      content: JSON.stringify({ type, data })
    });
    this.pool.publish(signed);
  }

  _closePeer(peerPubkey) {
    const peer = this.peers.get(peerPubkey); if (!peer) return;
    if (peer.iceTimer) clearTimeout(peer.iceTimer);
    if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
    try { peer.dc?.close(); } catch {}
    try { peer.pc?.close(); } catch {}
    this.peers.delete(peerPubkey);
    this._emit('peer-closed', { peerPubkey });
  }

  _cancelReconnect(pk) { const e = this.retrySchedule[pk]; if (e) { clearTimeout(e.timer); delete this.retrySchedule[pk]; } }

  _scheduleReconnect(pk, attempt) {
    const a = attempt || 0; if (a >= 6) return;
    this._cancelReconnect(pk);
    const timer = setTimeout(() => {
      delete this.retrySchedule[pk];
      if (!this.peers.has(pk) && this.roomId) this._maybeConnect(pk);
    }, Math.min(2 ** a * 2000, 30000));
    this.retrySchedule[pk] = { attempt: a, timer };
  }

  debug() {
    const peers = [];
    for (const [pk, peer] of this.peers) {
      peers.push({
        pubkey: pk.slice(0, 12),
        fsmState: peer.fsm?.getSnapshot().value,
        connState: peer.pc?.connectionState,
        dcState: peer.dc?.readyState || null,
        candidates: peer.pendingCandidates.length,
        buffered: peer.bufferedCandidates.length
      });
    }
    return { fsm: this.actor?.getSnapshot().value, room: this.room, roomId: this.roomId, peers, participants: this.getParticipants(), retrySchedule: Object.keys(this.retrySchedule) };
  }

  _emit(t, d) { this.dispatchEvent(new CustomEvent(t, { detail: d })); }
}

export const createDataSession = (opts) => new DataSession(opts);
