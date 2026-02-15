// LiveKit integration - real-time voice with ICE/TURN, data channels, reconnection
const lk = {
  room: null,
  _lk: null,
  _qualityInterval: null,
  _unavailable: false,

  // Cache the dynamic import - only load livekit-client once
  async _import() {
    if (!lk._lk) lk._lk = await import('livekit-client');
    return lk._lk;
  },

  async connect(channelName, opts = {}) {
    if (lk._unavailable) return;
    if (lk.room) await lk.disconnect();
    const { forceRelay = false } = opts;
    const token = auth?.getToken();
    const username = state.currentUser?.displayName || state.currentUser?.username || 'Guest' + state.userId;

    state.voiceConnectionState = 'connecting';

    try {
      // Fetch token + ICE config from server
      const params = new URLSearchParams({ channel: channelName, identity: username });
      if (forceRelay) params.set('forceRelay', 'true');

      const res = await fetch(`/api/livekit/token?${params}`, {
        headers: token ? { Authorization: 'Bearer ' + token } : {}
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'HTTP ' + res.status }));
        if (res.status === 503) lk._unavailable = true;
        throw new Error(err.error || 'Token request failed');
      }
      const data = await res.json();
      const { Room, RoomEvent, Track, DisconnectReason } = await lk._import();

      // Room options tuned for lowest latency behind QUIC/HTTP3 reverse proxy
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
        publishDefaults: {
          dtx: true,  // Discontinuous transmission - save bandwidth during silence
          red: true,  // Redundant encoding - protects against packet loss
        },
      });

      // -- Track events --
      room.on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        if (track.kind === Track.Kind.Audio && !state.voiceDeafened) {
          const el = track.attach();
          el.id = 'lk-audio-' + participant.identity;
          document.body.appendChild(el);
        }
        if (track.kind === Track.Kind.Video) lk.updateVoiceGrid();
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach(el => el.remove());
        lk.updateVoiceGrid();
      });

      // -- Participant events --
      room.on(RoomEvent.ActiveSpeakersChanged, () => lk.updateParticipants());
      room.on(RoomEvent.ParticipantConnected, () => lk.updateParticipants());
      room.on(RoomEvent.ParticipantDisconnected, () => lk.updateParticipants());

      // -- Connection lifecycle --
      room.on(RoomEvent.Disconnected, (reason) => {
        state.voiceConnectionState = 'disconnected';
        state.voiceConnectionQuality = 'lost';
        state.dataChannelAvailable = false;
        lk._stopQuality();

        const finals = [
          DisconnectReason?.CLIENT_INITIATED,
          DisconnectReason?.DUPLICATE_IDENTITY,
          DisconnectReason?.PARTICIPANT_REMOVED,
          DisconnectReason?.ROOM_DELETED,
        ].filter(Boolean);

        if (!reason || finals.includes(reason)) {
          lk.room = null;
          state.livekitRoom = null;
          state.voiceConnected = false;
          state.voiceChannelName = '';
          state.voiceParticipants = [];
          state.voiceDeafened = false;
          ui.voicePanel.classList.remove('visible');
          message.add('Voice disconnected');
        }
      });

      room.on(RoomEvent.Reconnecting, () => {
        state.voiceConnectionState = 'reconnecting';
        state.voiceConnectionQuality = 'reconnecting';
        state.voiceReconnectAttempts = state.voiceReconnectAttempts + 1;
        state.dataChannelAvailable = false;
        lk.updateParticipants();
      });

      room.on(RoomEvent.Reconnected, () => {
        state.voiceConnectionState = 'connected';
        state.voiceConnectionQuality = 'good';
        state.voiceReconnectAttempts = 0;
        state.dataChannelAvailable = true;
        lk.updateParticipants();
        message.add('Voice reconnected');
      });

      // -- Connection quality per-participant --
      room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        if (participant === room.localParticipant) {
          state.voiceConnectionQuality = lk._mapQuality(quality);
        }
        lk.updateParticipants();
      });

      // -- Data channel receive --
      room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
        lk._onData(payload, participant, topic);
      });

      // Connect with RTC config (ICE/TURN injected from server response)
      const connectOpts = {};
      if (data.rtcConfig) connectOpts.rtcConfig = data.rtcConfig;
      await room.connect(data.url, data.token, connectOpts);

      // Enable mic
      await room.localParticipant.setMicrophoneEnabled(!state.micMuted);

      // All state
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

      ui.voicePanel.classList.add('visible');
      ui.voicePanelChannel.textContent = channelName;

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
    lk._stopQuality();
    if (lk.room) {
      await lk.room.disconnect();
      lk.room = null;
    }
    state.livekitRoom = null;
    state.voiceConnected = false;
    state.voiceConnectionState = 'disconnected';
    state.voiceConnectionQuality = 'unknown';
    state.voiceChannelName = '';
    state.voiceParticipants = [];
    state.voiceReconnectAttempts = 0;
    state.dataChannelAvailable = false;
    state.voiceDeafened = false;
    ui.voicePanel.classList.remove('visible');
    lk.updateVoiceGrid();
  },

  // -- Mic / Camera / Deafen --

  async toggleMic() {
    if (!lk.room) return;
    state.micMuted = !state.micMuted;
    await lk.room.localParticipant.setMicrophoneEnabled(!state.micMuted);
    lk.updateParticipants();
    const btn = document.getElementById('micToggleBtn');
    if (btn) btn.classList.toggle('muted', state.micMuted);
    const voiceBtn = document.getElementById('voiceMicBtn');
    if (voiceBtn) voiceBtn.classList.toggle('active', !state.micMuted);
  },

  async toggleCamera() {
    if (!lk.room) return;
    const enabled = lk.room.localParticipant.isCameraEnabled;
    await lk.room.localParticipant.setCameraEnabled(!enabled);
    lk.updateVoiceGrid();
  },

  toggleDeafen() {
    state.voiceDeafened = !state.voiceDeafened;
    if (!lk.room) return;

    lk.room.remoteParticipants.forEach(p => {
      p.audioTrackPublications.forEach(pub => {
        if (!pub.track) return;
        if (state.voiceDeafened) {
          pub.track.detach().forEach(el => el.remove());
        } else {
          const el = pub.track.attach();
          el.id = 'lk-audio-' + p.identity;
          document.body.appendChild(el);
        }
      });
    });

    const btn = document.getElementById('deafenToggleBtn');
    if (btn) btn.classList.toggle('muted', state.voiceDeafened);
    const voiceBtn = document.getElementById('voiceDeafenBtn');
    if (voiceBtn) voiceBtn.classList.toggle('active', state.voiceDeafened);
    lk.updateParticipants();
  },

  // -- Data channel transport --

  _onData(payload, participant, topic) {
    if (!state.useDataChannel || !participant) return;

    switch (topic) {
      case 'audio_start':
        message.handlers.speaker_joined({ userId: participant.identity, user: participant.identity });
        break;
      case 'audio_chunk':
        message.handlers.audio_data({ userId: participant.identity, data: payload });
        break;
      case 'audio_end':
        message.handlers.speaker_left({ userId: participant.identity, user: participant.identity });
        break;
      case 'text_message':
        try {
          const msg = JSON.parse(new TextDecoder().decode(payload));
          if (msg.type && message.handlers[msg.type]) message.handlers[msg.type](msg);
        } catch (e) { /* ignore malformed */ }
        break;
    }
  },

  async sendData(topic, data, reliable = true) {
    if (!lk.room?.localParticipant) return false;
    try {
      const payload = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      await lk.room.localParticipant.publishData(payload, { reliable, topic });
      return true;
    } catch (e) {
      return false;
    }
  },

  isDataChannelReady() {
    return state.dataChannelAvailable && state.useDataChannel &&
           lk.room?.localParticipant && state.voiceConnectionState === 'connected';
  },

  // -- Connection quality --

  _mapQuality(q) {
    if (!lk._lk) return 'unknown';
    const CQ = lk._lk.ConnectionQuality;
    if (!CQ) return 'unknown';
    const map = { [CQ.Excellent]: 'excellent', [CQ.Good]: 'good', [CQ.Poor]: 'poor', [CQ.Lost]: 'lost' };
    return map[q] || 'unknown';
  },

  _startQuality() {
    lk._stopQuality();
    lk._qualityInterval = setInterval(() => {
      if (!lk.room?.localParticipant) return;
      state.voiceConnectionQuality = lk._mapQuality(lk.room.localParticipant.connectionQuality);
    }, 3000);
  },

  _stopQuality() {
    if (lk._qualityInterval) { clearInterval(lk._qualityInterval); lk._qualityInterval = null; }
  },

  // -- Participant list --

  updateParticipants() {
    if (!lk.room) { state.voiceParticipants = []; return; }

    const participants = [];
    const local = lk.room.localParticipant;
    participants.push({
      identity: local.identity || 'You',
      isSpeaking: local.isSpeaking,
      isMuted: !local.isMicrophoneEnabled,
      isLocal: true,
      hasVideo: local.isCameraEnabled,
      connectionQuality: lk._mapQuality(local.connectionQuality),
    });

    lk.room.remoteParticipants.forEach(p => {
      participants.push({
        identity: p.identity,
        isSpeaking: p.isSpeaking,
        isMuted: !p.isMicrophoneEnabled,
        isLocal: false,
        hasVideo: p.isCameraEnabled,
        connectionQuality: lk._mapQuality(p.connectionQuality),
      });
    });

    state.voiceParticipants = participants;
    ui.render.voiceGrid?.();
    ui.render.channels?.();
  },

  updateVoiceGrid() { lk.updateParticipants(); }
};

window.lk = lk;
