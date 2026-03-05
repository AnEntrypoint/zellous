const lk = {
  room: null,
  _lk: null,
  _qualityInterval: null,

  async _import() {
    if (!lk._lk) lk._lk = await import('livekit-client');
    return lk._lk;
  },

  _cleanupAudioElements() {
    document.querySelectorAll('[id^="lk-audio-"]').forEach(el => el.remove());
  },

  _resetState() {
    lk._cleanupAudioElements();
    lk._stopQuality();
    lk.room = null;
    state.livekitRoom = null;
    state.voiceConnected = false;
    state.voiceConnectionState = 'disconnected';
    state.voiceConnectionQuality = 'unknown';
    state.voiceChannelName = '';
    state.voiceParticipants = [];
    state.voiceReconnectAttempts = 0;
    state.dataChannelAvailable = false;
    state.voiceDeafened = false;
    state.activeSpeakers = new Set();
    if (ui.voicePanel) ui.voicePanel.classList.remove('visible');
  },

  _wireRoom(room) {
    const { RoomEvent, Track } = lk._lk;
    room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.id = 'lk-audio-' + participant.identity;
        if (state.voiceDeafened) el.muted = true;
        document.body.appendChild(el);
      }
      if (track.kind === Track.Kind.Video) lk.updateParticipants();
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => { track.detach().forEach(el => el.remove()); lk.updateParticipants(); });
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => { state.activeSpeakers = new Set(speakers.map(p => p.identity)); lk.updateParticipants(); });
    room.on(RoomEvent.ParticipantConnected, () => lk.updateParticipants());
    room.on(RoomEvent.ParticipantDisconnected, () => lk.updateParticipants());
    room.on(RoomEvent.Disconnected, (reason) => {
      state.voiceConnectionState = 'disconnected';
      state.voiceConnectionQuality = 'lost';
      state.dataChannelAvailable = false;
      lk._stopQuality();
      const { DisconnectReason } = lk._lk || {};
      const finals = [DisconnectReason?.CLIENT_INITIATED, DisconnectReason?.DUPLICATE_IDENTITY, DisconnectReason?.PARTICIPANT_REMOVED, DisconnectReason?.ROOM_DELETED].filter(Boolean);
      if (!reason || finals.includes(reason)) { lk._resetState(); message.add('Voice disconnected'); }
    });
    room.on(RoomEvent.Reconnecting, () => { state.voiceConnectionState = 'reconnecting'; state.voiceConnectionQuality = 'reconnecting'; state.voiceReconnectAttempts = state.voiceReconnectAttempts + 1; state.dataChannelAvailable = false; lk.updateParticipants(); });
    room.on(RoomEvent.Reconnected, () => { state.voiceConnectionState = 'connected'; state.voiceConnectionQuality = 'good'; state.voiceReconnectAttempts = 0; state.dataChannelAvailable = true; lk.updateParticipants(); message.add('Voice reconnected'); });
    room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => { if (participant === room.localParticipant) state.voiceConnectionQuality = lk._mapQuality(quality); lk.updateParticipants(); });
    room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => { lk._onData(payload, participant, topic); });
  },

  async connect(channelName, opts = {}) {
    if (lk.room) await lk.disconnect();
    const token = auth?.getToken();
    const username = state.currentUser?.displayName || state.currentUser?.username || 'Guest' + state.userId;
    state.voiceConnectionState = 'connecting';
    try {
      const params = new URLSearchParams({ channel: channelName, identity: username });
      if (opts.forceRelay) params.set('forceRelay', 'true');
      const res = await fetch(`/api/livekit/token?${params}`, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: 'HTTP ' + res.status })); throw new Error(err.error || 'Token request failed'); }
      const data = await res.json();
      await lk._import();
      const room = new lk._lk.Room({ adaptiveStream: true, dynacast: true, audioCaptureDefaults: { autoGainControl: true, echoCancellation: true, noiseSuppression: true }, publishDefaults: { dtx: true, red: true } });
      lk._wireRoom(room);
      const connectOpts = {};
      if (data.rtcConfig) connectOpts.rtcConfig = data.rtcConfig;
      await room.connect(data.url, data.token, connectOpts);
      await room.localParticipant.setMicrophoneEnabled(!state.micMuted);
      lk.room = room;
      state.livekitRoom = room;
      state.voiceConnected = true;
      state.voiceConnectionState = 'connected';
      state.voiceConnectionQuality = 'good';
      state.voiceChannelName = channelName;
      state.voiceReconnectAttempts = 0;
      state.dataChannelAvailable = true;
      lk.updateParticipants();
      lk._startQuality();
      if (ui.voicePanel) ui.voicePanel.classList.add('visible');
      if (ui.voicePanelChannel) ui.voicePanelChannel.textContent = channelName;
    } catch (e) {
      console.warn('[LiveKit] Connect failed:', e.message);
      state.voiceConnected = false;
      state.voiceConnectionState = 'disconnected';
      state.voiceConnectionQuality = 'unknown';
      state.dataChannelAvailable = false;
      message.add('Voice failed: ' + e.message);
    }
  },

  async disconnect() {
    if (lk.room) { await lk.room.disconnect(); }
    lk._resetState();
    lk.updateParticipants();
  },

  async toggleMic() {
    if (!lk.room) return;
    state.micMuted = !state.micMuted;
    await lk.room.localParticipant.setMicrophoneEnabled(!state.micMuted);
    lk.updateParticipants();
    document.getElementById('micToggleBtn')?.classList.toggle('muted', state.micMuted);
    document.getElementById('voiceMicBtn')?.classList.toggle('active', !state.micMuted);
  },

  async toggleCamera() {
    if (!lk.room) return;
    const enabled = lk.room.localParticipant.isCameraEnabled;
    await lk.room.localParticipant.setCameraEnabled(!enabled);
    lk.updateParticipants();
  },

  toggleDeafen() {
    state.voiceDeafened = !state.voiceDeafened;
    document.querySelectorAll('[id^="lk-audio-"]').forEach(el => { el.muted = state.voiceDeafened; });
    document.getElementById('deafenToggleBtn')?.classList.toggle('muted', state.voiceDeafened);
    document.getElementById('voiceDeafenBtn')?.classList.toggle('active', state.voiceDeafened);
    lk.updateParticipants();
  },

  _onData(payload, participant, topic) {
    if (!state.useDataChannel || !participant) return;
    switch (topic) {
      case 'audio_start': message.handlers.speaker_joined({ userId: participant.identity, user: participant.identity }); break;
      case 'audio_chunk': message.handlers.audio_data({ userId: participant.identity, data: payload }); break;
      case 'audio_end': message.handlers.speaker_left({ userId: participant.identity, user: participant.identity }); break;
      case 'text_message': try { const msg = JSON.parse(new TextDecoder().decode(payload)); if (msg.type && message.handlers[msg.type]) message.handlers[msg.type](msg); } catch (e) {} break;
    }
  },

  async sendData(topic, data, reliable = true) {
    if (!lk.room?.localParticipant) return false;
    try {
      const payload = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      await lk.room.localParticipant.publishData(payload, { reliable, topic });
      return true;
    } catch (e) { return false; }
  },

  isDataChannelReady() {
    return state.dataChannelAvailable && state.useDataChannel && lk.room?.localParticipant && state.voiceConnectionState === 'connected';
  },

  _mapQuality(q) {
    if (!lk._lk) return 'unknown';
    const CQ = lk._lk.ConnectionQuality;
    if (!CQ) return 'unknown';
    return { [CQ.Excellent]: 'excellent', [CQ.Good]: 'good', [CQ.Poor]: 'poor', [CQ.Lost]: 'lost' }[q] || 'unknown';
  },

  _startQuality() {
    lk._stopQuality();
    lk._qualityInterval = setInterval(() => {
      if (!lk.room?.localParticipant) return;
      state.voiceConnectionQuality = lk._mapQuality(lk.room.localParticipant.connectionQuality);
      ui.render.voicePanel?.();
    }, 3000);
  },

  _stopQuality() { if (lk._qualityInterval) { clearInterval(lk._qualityInterval); lk._qualityInterval = null; } },

  updateParticipants() {
    if (!lk.room) { state.voiceParticipants = []; return; }
    const speakers = state.activeSpeakers || new Set();
    const local = lk.room.localParticipant;
    const participants = [{ identity: local.identity || 'You', isSpeaking: speakers.has(local.identity) || local.isSpeaking, isMuted: !local.isMicrophoneEnabled, isLocal: true, hasVideo: local.isCameraEnabled, connectionQuality: lk._mapQuality(local.connectionQuality) }];
    lk.room.remoteParticipants.forEach(p => {
      participants.push({ identity: p.identity, isSpeaking: speakers.has(p.identity) || p.isSpeaking, isMuted: !p.isMicrophoneEnabled, isLocal: false, hasVideo: p.isCameraEnabled, connectionQuality: lk._mapQuality(p.connectionQuality) });
    });
    state.voiceParticipants = participants;
    ui.render.voiceGrid?.();
    ui.render.voicePanel?.();
    ui.render.channels?.();
  },

  updateVoiceGrid() { lk.updateParticipants(); }
};

window.lk = lk;
