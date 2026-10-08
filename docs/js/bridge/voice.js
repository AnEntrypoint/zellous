export function installVoice(ww) {
  const a = ww.auth;
  const chat = ww.chat;
  // Voice bridge — the main one
  let voice = null;
  // Re-applies volume/mute/sink to every already-created peer <audio> element --
  // onAudioTrack only sets these at element-creation time, so a mid-call deafen
  // toggle or a Voice Settings volume/output-device change previously had zero
  // effect on peers that joined before the change. Lives outside ensureVoice()
  // (unlike the identically-named local it replaces) since it only touches
  // `document`/`state`, not the `voice` instance -- callers need it reachable
  // whether or not a voice session is currently active.
  const applyOutputSettings = () => {
    const vol = typeof state.masterVolume === 'number' ? state.masterVolume : 1.0;
    document.querySelectorAll('audio[data-voice-peer]').forEach((el) => {
      el.muted = !!state.voiceDeafened;
      el.volume = vol;
      if (state.outputDeviceId && el.setSinkId) el.setSinkId(state.outputDeviceId).catch(() => {});
    });
  };
  const ensureVoice = () => {
    if (voice) { voice.serverId = state.currentServerId || ''; return voice; }
    voice = ww.ensureVoice({
      serverId: state.currentServerId || '',
      displayName: (a.pubkey ? chat.resolveProfile(a.pubkey) : 'Guest'),
      onAudioTrack: ({ peer, stream, peerPubkey }) => {
        if (!peer.audioEl) {
          const el = new Audio();
          el.autoplay = true;
          el.playsInline = true;
          el.muted = !!state.voiceDeafened;
          el.volume = typeof state.masterVolume === 'number' ? state.masterVolume : 1.0;
          el.style.display = 'none';
          el.dataset.voicePeer = peerPubkey;
          document.body.appendChild(el);
          peer.audioEl = el;
          if (state.outputDeviceId && el.setSinkId) el.setSinkId(state.outputDeviceId).catch(() => {});
        }
        peer.audioEl.srcObject = stream;
        const tryPlay = () => peer.audioEl.play().catch(() => {
          const resume = () => { peer.audioEl?.play().catch(() => {}); document.removeEventListener('click', resume); document.removeEventListener('keydown', resume); document.removeEventListener('touchstart', resume); };
          document.addEventListener('click', resume, { once: true });
          document.addEventListener('keydown', resume, { once: true });
          document.addEventListener('touchstart', resume, { once: true });
        });
        tryPlay();
      },
      onVideoTrack: ({ peerPubkey, stream }) => {
        const key = 'nostr-' + peerPubkey.slice(0, 12);
        const p = voice.participants.get(key);
        if (p) { p.hasVideo = true; p._videoStream = stream; }
        const elId = 'vtile-video-' + peerPubkey.slice(0, 8);
        let el = document.getElementById(elId);
        if (!el) {
          el = document.createElement('video'); el.id = elId; el.autoplay = true; el.playsinline = true;
          el.dataset.voicePeer = peerPubkey;
          el.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px';
          const wrap = document.getElementById('vtile-wrap-' + peerPubkey.slice(0, 8));
          if (wrap) wrap.appendChild(el);
        }
        el.srcObject = stream;
      }
    });
    // onAudioTrack/onVideoTrack append per-peer <audio>/<video> elements tagged with
    // data-voice-peer, but wireweave exposes no dedicated per-peer-left event at this
    // bridge layer -- only the aggregate 'participants' list and full 'disconnected'.
    // Diffing the DOM-tagged elements against the live participant set on every
    // 'participants' event is the only reliable per-peer cleanup point available here;
    // 'disconnected' unconditionally sweeps everything as a backstop.
    const pruneVoiceMedia = (liveIds) => {
      document.querySelectorAll('[data-voice-peer]').forEach((el) => {
        if (!liveIds || !liveIds.has(el.dataset.voicePeer)) {
          try { el.srcObject = null; } catch {}
          if (el.tagName === 'AUDIO') { try { el.pause(); } catch {} }
          el.remove();
        }
      });
    };
    voice.addEventListener('state', (e) => { state.voiceConnectionState = e.detail.value === 'connected' ? 'connected' : e.detail.value === 'idle' ? 'disconnected' : e.detail.value; state.voiceConnected = e.detail.value === 'connected'; });
    voice.addEventListener('participants', (e) => {
      state.voiceParticipants = e.detail.list;
      pruneVoiceMedia(new Set((e.detail.list || []).map((p) => p.identity)));
    });
    // window.message.add feeds state.messages, which ui.render.messages() (ui.js)
    // is an intentional no-op for -- the SDK owns rendering reactively and never
    // reads state.messages, so anything routed only through window.message.add
    // here is computed correctly but never reaches the screen. window.ui.showToast
    // is the real, live-rendered surface (routes to the SDK's own toast).
    voice.addEventListener('connected', (e) => { state.voiceChannelName = e.detail.channelName; state.voiceParticipants = voice.getParticipants(); window.ui?.showToast?.('Voice connected', 2000); });
    voice.addEventListener('media-warning', (e) => { state.voiceListenOnly = true; window.ui?.showToast?.('Joined listen-only: no microphone available', 4500, 'error'); });
    voice.addEventListener('disconnected', () => { state.voiceListenOnly = false; state.voiceChannelName = ''; state.voiceParticipants = []; state.voiceDeafened = false; state.micMuted = false; state.activeSpeakers = new Set(); state.micRawLevel = 0; pruneVoiceMedia(null); });
    voice.addEventListener('mic', (e) => { state.micMuted = !!e.detail.muted; });
    voice.addEventListener('speaker', () => { try { state.activeSpeakers = new Set(voice.getParticipants().filter(p => p.isSpeaking && !p.isLocal).map(p => p.identity)); } catch {} });
    let lastLevelWrite = 0;
    voice.addEventListener('local-level', (e) => {
      const q = Math.round(e.detail.level * 10) / 10;
      const now = performance.now();
      if (state.micRawLevel === q || (q !== 0 && now - lastLevelWrite < 150)) return;
      lastLevelWrite = now;
      state.micRawLevel = q;
    });
    return voice;
  };

  const voiceAPI = {
    get _participants() { return ensureVoice().participants; },
    get _peers() { return ensureVoice().peers; },
    get _roomId() { return ensureVoice().roomId; },
    get _channelName() { return ensureVoice().channelName; },
    async connect(ch) {
      const v = ensureVoice();
      v.serverId = state.currentServerId || '';
      v.setAudioConstraints({
        deviceId: state.inputDeviceId || null,
        noiseSuppression: state.rnnoiseEnabled !== false,
        autoGainControl: state.autoGainEnabled !== false,
      });
      v.setForceRelay(!!state.forceTurnEnabled);
      // vadThreshold is a 0-1 UI fraction (Voice Settings slider); setMicSensitivity
      // takes a raw RMS. LEVEL_METER_CEILING (wireweave's voice.js, 0.35) is the same
      // ceiling the SDK's own level meter normalizes against, so scaling by it keeps
      // the slider's 0-1 range meaningful instead of setting an RMS floor near-unreachable
      // in practice (passing the 0-1 fraction straight through, e.g. the default 0.15,
      // sets a threshold over 4x wireweave's own SPEAKER_ACTIVE_RMS default of 0.045).
      if (typeof state.vadThreshold === 'number' && state.vadThreshold > 0) v.setMicSensitivity(Math.min(1, state.vadThreshold) * 0.35);
      await v.connect(ch, { displayName: (a.pubkey && chat.resolveProfile(a.pubkey)) || 'Guest' });
      state.micMuted = !!v.muted;
    },
    setAudioConstraints(patch) { ensureVoice().setAudioConstraints(patch); },
    setForceRelay(on) { ensureVoice().setForceRelay(on); },
    setMicSensitivity(rms) { ensureVoice().setMicSensitivity(rms); },
    setAudioBitrate(kbps) {
      const tier = kbps <= 16 ? 'low' : kbps <= 32 ? 'medium' : kbps <= 48 ? 'high' : 'max';
      ensureVoice().setAudioQuality(tier);
    },
    async disconnect() { if (voice) await voice.disconnect(); },
    toggleMic() { const v = ensureVoice(); v.toggleMic(); state.micMuted = !!v.muted; },
    setMuted(want) { const v = ensureVoice(); v.setMuted(!!want); state.micMuted = !!v.muted; },
    requestTransmit() { const v = ensureVoice(); const live = v.requestTransmit(); state.micMuted = !!v.muted; return live; },
    releaseTransmit() { const v = ensureVoice(); v.releaseTransmit(); state.micMuted = !!v.muted; },
    anyRemoteSpeaking() { return voice ? voice.anyRemoteSpeaking() : false; },
    toggleDeafen() { ensureVoice().toggleDeafen(); state.voiceDeafened = voice.deafened; applyOutputSettings(); },
    async toggleCamera() { /* camera handled via onVideoTrack above; full port deferred */ },
    updateParticipants() { if (voice) { state.voiceParticipants = voice.getParticipants(); } },
    isDataChannelReady: () => { if (!voice) return false; for (const [, p] of voice.peers) if (p.dc?.readyState === 'open') return true; return false; },
    updateVoiceGrid() { voiceAPI.updateParticipants(); },
    applyOutputSettings,
    on(evt, fn) { ensureVoice().addEventListener(evt, fn); return () => voice?.removeEventListener(evt, fn); },
    get __debug() { return voice?.debug() || null; }
  };
  window.nostrVoice = voiceAPI;
  window.lk = voiceAPI;
  window.nostrVoiceRtc = { maybeConnect: (pk) => voice?._maybeConnect(pk), handleSignal: (e) => voice?._handleSignal(e), subscribe: () => {}, publish: () => {}, cancelReconnect: (pk) => voice?._cancelReconnect(pk), scheduleReconnect: (pk, a) => voice?._scheduleReconnect(pk, a) };
  window.nostrVoiceSfu = { start: () => voice?._sfuStart(), stop: () => voice?._sfuStop(), onPresenceRtt: (pk, s) => { if (voice) voice.sfu.rttMatrix.set(pk, s); voice?._sfuMaybeElect(); }, get __debug() { if (!voice) return null; const m = {}; voice.sfu.rttMatrix.forEach((v, k) => m[k.slice(0, 12)] = v); return { mode: voice.sfu.actor?.getSnapshot().value, hub: voice.sfu.hub?.slice(0, 12) || null, rttMatrix: m }; } };
  window.nostrVoiceCamera = { toggle: () => voiceAPI.toggleCamera(), start: () => voiceAPI.toggleCamera(), stop: () => voiceAPI.toggleCamera() };
}
