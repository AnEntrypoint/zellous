const LEVEL_METER_CEILING = 0.35;
const SPEAKING_MIN_MS = 250;

let bloopCtx = null;
const playBloop = (up) => {
  if (typeof AudioContext === 'undefined') return;
  bloopCtx = bloopCtx || new AudioContext();
  const t = bloopCtx.currentTime;
  const osc = bloopCtx.createOscillator();
  const gain = bloopCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(up ? 520 : 780, t);
  osc.frequency.exponentialRampToValueAtTime(up ? 780 : 520, t + 0.2);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
  osc.connect(gain).connect(bloopCtx.destination);
  osc.start(t);
  osc.stop(t + 0.26);
};

export function installVoice(ww) {
  const a = ww.auth;
  const chat = ww.chat;
  let voice = null;
  let refreshParticipants = () => {};
  const applyOutputSettings = () => {
    const vol = typeof state.masterVolume === 'number' ? state.masterVolume : 1.0;
    document.querySelectorAll('audio[data-voice-peer]').forEach((el) => {
      el.muted = !!state.voiceDeafened;
      el.volume = vol;
      if (state.outputDeviceId && el.setSinkId) el.setSinkId(state.outputDeviceId).catch(() => {});
    });
  };
  const setVoiceVideo = (key, stream) => {
    const next = { ...(state.voiceVideos || {}) };
    if (stream) next[key] = stream; else delete next[key];
    state.voiceVideos = next;
    setTimeout(() => document.querySelectorAll('[data-video-peer]').forEach((el) => { const s = next[el.dataset.videoPeer]; if (s && el.srcObject !== s) el.srcObject = s; }), 0);
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
      onVideoTrack: ({ peerPubkey, stream }) => { setVoiceVideo('nostr-' + peerPubkey.slice(0, 12), stream); },
    });
    const pruneVoiceMedia = (liveIds) => {
      document.querySelectorAll('[data-voice-peer]').forEach((el) => {
        if (!liveIds || !liveIds.has(el.dataset.voicePeer)) {
          try { el.srcObject = null; } catch {}
          if (el.tagName === 'AUDIO') { try { el.pause(); } catch {} }
          el.remove();
        }
      });
    };
    refreshParticipants = () => { const list = voice.getParticipants(); applyParticipants(list); publishSpeaking(list); };
    voice.addEventListener('state', (e) => { state.voiceConnectionState = e.detail.value === 'connected' ? 'connected' : e.detail.value === 'idle' ? 'disconnected' : e.detail.value; state.voiceConnected = e.detail.value === 'connected'; });
    let lastStructure = '';
    const structureOf = (list) => JSON.stringify(list.map((p) => [p.key, p.identity, !!p.isMuted, !!p.isLocal, !!p.hasVideo, p.connectionQuality]));
    const applyParticipants = (list) => {
      const key = structureOf(list);
      if (key === lastStructure) return false;
      lastStructure = key;
      state.voiceParticipants = list;
      return true;
    };
    let speakingWrittenAt = 0;
    let speakingPending = '';
    let speakingTimer = null;
    const flushSpeaking = () => {
      speakingTimer = null;
      if (state.voiceSpeaking === speakingPending) return;
      state.voiceSpeaking = speakingPending;
      speakingWrittenAt = performance.now();
    };
    const publishSpeaking = (list) => {
      speakingPending = list.filter((p) => p.isSpeaking).map((p) => p.key).sort().join('|');
      if (state.voiceSpeaking === speakingPending) return;
      const wait = SPEAKING_MIN_MS - (performance.now() - speakingWrittenAt);
      if (wait <= 0) { if (speakingTimer) { clearTimeout(speakingTimer); speakingTimer = null; } flushSpeaking(); }
      else if (!speakingTimer) speakingTimer = setTimeout(flushSpeaking, wait);
    };
    voice.addEventListener('state', (e) => { state.voiceConnectionState = e.detail.value === 'connected' ? 'connected' : e.detail.value === 'idle' ? 'disconnected' : e.detail.value; state.voiceConnected = e.detail.value === 'connected'; });
    voice.addEventListener('participants', (e) => {
      const list = e.detail.list || [];
      const prevIds = new Set((state.voiceParticipants || []).map((p) => p.identity));
      publishSpeaking(list);
      if (!applyParticipants(list)) return;
      const nowIds = list.map((p) => p.identity);
      if (state.pref_vcsounds && state.pref_vcsounds.value && prevIds.size > 0) {
        if (nowIds.some((id) => !prevIds.has(id))) playBloop(true);
        else if ([...prevIds].some((id) => !nowIds.includes(id))) playBloop(false);
      }
      pruneVoiceMedia(new Set([...voice.remoteKeys(), ...list.flatMap((p) => [p.identity, p.key])]));
      const sharing = new Set(list.filter((p) => p.hasVideo).map((p) => p.key));
      for (const key of Object.keys(state.voiceVideos || {})) if (key !== 'local' && !sharing.has(key)) setVoiceVideo(key, null);
    });
    voice.addEventListener('connected', (e) => { state.voiceChannelName = e.detail.channelName; const list = voice.getParticipants(); applyParticipants(list); publishSpeaking(list); window.ui?.showToast?.('Voice connected', 2000); });
    voice.addEventListener('media-warning', (e) => { state.voiceListenOnly = true; window.ui?.showToast?.('Joined listen-only: no microphone available', 4500, 'error'); });
    voice.addEventListener('disconnected', () => { lastStructure = ''; speakingPending = ''; if (speakingTimer) { clearTimeout(speakingTimer); speakingTimer = null; } state.voiceListenOnly = false; state.voiceChannelName = ''; state.voiceParticipants = []; state.voiceSpeaking = ''; state.voiceDeafened = false; state.micMuted = false; pruneVoiceMedia(null); });
    voice.addEventListener('mic', (e) => { state.micMuted = !!e.detail.muted; });
    return voice;
  };

  const voiceAPI = {
    get _participants() { return ensureVoice().participants; },
    get _peers() { return ensureVoice().peers; },
    get _roomId() { return ensureVoice().roomId; },
    get _channelName() { return ensureVoice().channelName; },
    session: () => ensureVoice(),
    async connect(ch) {
      const v = ensureVoice();
      v.serverId = state.currentServerId || '';
      v.setAudioConstraints({
        deviceId: state.inputDeviceId || null,
        noiseSuppression: state.rnnoiseEnabled !== false,
        autoGainControl: state.autoGainEnabled !== false,
      });
      v.setForceRelay(!!state.forceTurnEnabled);
      if (typeof state.vadThreshold === 'number' && state.vadThreshold > 0) v.setMicSensitivity(Math.min(1, state.vadThreshold) * LEVEL_METER_CEILING);
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
    setScreen(on) { const v = ensureVoice(); return v.setScreen(!!on).then(() => setVoiceVideo('local', v.cameraStream || null)); },
    setCamera(on) { const v = ensureVoice(); return v.setCamera(!!on).then(() => setVoiceVideo('local', v.cameraStream || null)); },
    requestTransmit() { const v = ensureVoice(); const live = v.requestTransmit(); state.micMuted = !!v.muted; return live; },
    releaseTransmit() { const v = ensureVoice(); v.releaseTransmit(); state.micMuted = !!v.muted; },
    anyRemoteSpeaking() { return voice ? voice.anyRemoteSpeaking() : false; },
    toggleDeafen() { ensureVoice().toggleDeafen(); state.voiceDeafened = voice.deafened; applyOutputSettings(); },
    async toggleCamera() {},
    updateParticipants() { if (voice) refreshParticipants(); },
    isDataChannelReady: () => { if (!voice) return false; for (const [, p] of voice.peers) if (p.dc?.readyState === 'open') return true; return false; },
    updateVoiceGrid() { voiceAPI.updateParticipants(); },
    applyOutputSettings,
    on(evt, fn) { ensureVoice().addEventListener(evt, fn); return () => voice?.removeEventListener(evt, fn); },
    get __debug() { return voice?.debug() || null; }
  };
  window.nostrVoice = voiceAPI;
  window.lk = voiceAPI;
  window.nostrVoiceSfu = { start: () => voice?._sfuStart(), stop: () => voice?._sfuStop(), onPresenceRtt: (pk, s) => { if (voice) voice.sfu.rttMatrix.set(pk, s); voice?._sfuMaybeElect(); }, get __debug() { if (!voice) return null; const m = {}; voice.sfu.rttMatrix.forEach((v, k) => m[k.slice(0, 12)] = v); return { mode: voice.sfu.actor?.getSnapshot().value, hub: voice.sfu.hub?.slice(0, 12) || null, rttMatrix: m }; } };
}
