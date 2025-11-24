const network = {
  connect: () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    state.ws = new WebSocket(`${protocol}//${window.location.host}`);
    state.ws.binaryType = 'arraybuffer';
    state.ws.onopen = () => { ui.setStatus('Connected', false); network.send({ type: 'join_room', roomId: state.roomId }); };
    state.ws.onmessage = (e) => message.handle(msgpackr.unpack(new Uint8Array(e.data)));
    state.ws.onerror = () => ui.setStatus('Error', true);
    state.ws.onclose = () => { ui.setStatus('Disconnected', true); setTimeout(network.connect, 3000); };
  },
  send: (msg) => { if (state.ws?.readyState === WebSocket.OPEN) { msg.roomId = state.roomId; state.ws.send(msgpackr.pack(msg)); } }
};
const message = {
  handlers: {
    speaker_joined: (m) => {
      state.activeSpeakers.add(m.userId);
      if (m.userId !== state.userId) queue.addSegment(m.userId, m.user);
      state.recordingAudio.set(m.userId, []);
      message.add(`${m.user} started talking`, null, m.userId, m.user);
      ui.render.speakers(); ui.render.queue();
    },
    speaker_left: (m) => {
      state.activeSpeakers.delete(m.userId);
      webcam.hidePlayback();
      if (m.userId !== state.userId) queue.completeSegment(m.userId);
      message.add(`${m.user} stopped talking`, state.recordingAudio.get(m.userId), m.userId, m.user);
      state.recordingAudio.delete(m.userId);
      if (state.currentLiveSpeaker === m.userId) state.currentLiveSpeaker = null;
      if (state.activeSpeakers.size === 0) { state.skipLiveAudio = false; state.currentLiveSpeaker = null; }
      if (!state.currentLiveSpeaker && !state.currentSegmentId && !state.replayingSegmentId && !state.isDeafened && !state.isSpeaking) queue.playNext();
      ui.render.speakers(); ui.render.queue();
    },
    audio_data: (m) => {
      if (!state.activeSegments.has(m.userId) && !state.activeSpeakers.has(m.userId)) {
        state.activeSpeakers.add(m.userId); queue.addSegment(m.userId, `User${m.userId}`); state.recordingAudio.set(m.userId, []); ui.render.speakers();
      }
      queue.addChunk(m.userId, m.data);
      if (state.recordingAudio.has(m.userId)) state.recordingAudio.get(m.userId).push(new Uint8Array(m.data));
      if (!state.isDeafened && !state.isSpeaking && !state.skipLiveAudio) {
        if (!state.currentLiveSpeaker) state.currentLiveSpeaker = m.userId;
        if (state.currentLiveSpeaker === m.userId) { audio.handleChunk(m.userId, m.data); const s = state.activeSegments.get(m.userId); if (s) s.playedRealtime = true; }
      }
    },
    video_chunk: (m) => {
      const s = state.activeSegments.get(m.userId);
      if (s) { if (!s.videoChunks) s.videoChunks = []; s.videoChunks.push(m.data); }
      if (!state.isDeafened && !state.isSpeaking && !state.skipLiveAudio && state.currentLiveSpeaker === m.userId) {
        if (!state.incomingVideoChunks) state.incomingVideoChunks = new Map();
        if (!state.incomingVideoChunks.has(m.userId)) state.incomingVideoChunks.set(m.userId, []);
        state.incomingVideoChunks.get(m.userId).push(m.data);
        webcam.streamChunk(m.userId, m.data, s?.username || `User${m.userId}`);
      }
    },
    user_joined: (m) => message.add(`${m.user} joined`, null, m.userId, m.user),
    user_left: (m) => message.add('User left', null, m.userId),
    connection_established: (m) => { state.userId = m.clientId; },
    room_joined: (m) => { message.add(`Joined room: ${m.roomId}`); m.currentUsers.forEach(u => message.add(`${u.username} is online`, null, u.id, u.username)); ui.render.roomName(); }
  },
  handle: (m) => { const h = message.handlers[m.type]; if (h) h(m); },
  add: (text, audioData = null, userId = null, username = null) => {
    const id = Date.now() + Math.random();
    const m = { id, text, time: new Date().toLocaleTimeString(), userId, username };
    if (audioData?.length) { m.hasAudio = true; state.audioHistory.set(id, audioData); }
    state.messages.push(m);
    if (state.messages.length > 50) { const r = state.messages.shift(); if (r.hasAudio) state.audioHistory.delete(r.id); }
    ui.render.messages();
  }
};
window.network = network;
window.message = message;
