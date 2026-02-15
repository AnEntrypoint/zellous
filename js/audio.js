const audio = {
  initEncoder: () => {
    state.audioEncoder = new AudioEncoder({
      output: (chunk) => {
        const buffer = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buffer);
        state.ownAudioChunks.push(new Uint8Array(buffer));
        network.sendAudio({ type: 'audio_chunk', data: buffer });
      },
      error: () => {}
    });
    state.audioEncoder.configure({ codec: 'opus', sampleRate: config.sampleRate, numberOfChannels: 1, bitrate: 24000 });
  },
  createDecoder: (userId) => {
    const decoder = new AudioDecoder({
      output: (audioData) => {
        const buffer = new ArrayBuffer(audioData.allocationSize({ planeIndex: 0 }));
        audioData.copyTo(buffer, { planeIndex: 0 });
        if (!state.audioBuffers.has(userId)) state.audioBuffers.set(userId, []);
        state.audioBuffers.get(userId).push(new Float32Array(buffer));
        audioData.close();
        if (!state.audioSources.has(userId) && state.playbackState.get(userId) !== 'paused') audio.play(userId);
      },
      error: () => {}
    });
    decoder.configure({ codec: 'opus', sampleRate: config.sampleRate, numberOfChannels: 1 });
    return decoder;
  },
  handleChunk: (userId, data) => {
    if (state.audioContext?.state === 'suspended') state.audioContext.resume();
    if (!state.audioDecoders.has(userId)) state.audioDecoders.set(userId, audio.createDecoder(userId));
    try { state.audioDecoders.get(userId).decode(new EncodedAudioChunk({ type: 'key', timestamp: performance.now() * 1000, data: new Uint8Array(data) })); } catch (e) {}
  },
  play: (userId) => {
    if (state.audioSources.has(userId)) return;
    if (state.audioContext?.state === 'suspended') state.audioContext.resume();
    const gainNode = state.audioContext.createGain();
    gainNode.gain.value = state.masterVolume;
    gainNode.connect(state.audioContext.destination);
    state.audioSources.set(userId, { gainNode });
    state.playbackState.set(userId, 'playing');
    if (!state.scheduledPlaybackTime.has(userId)) state.scheduledPlaybackTime.set(userId, state.audioContext.currentTime + 0.05);
    const interval = setInterval(() => {
      if (!state.audioSources.has(userId)) { clearInterval(interval); return; }
      const q = state.audioBuffers.get(userId);
      if (!q?.length) { if (!state.activeSpeakers.has(userId)) { state.audioSources.delete(userId); state.audioBuffers.delete(userId); state.playbackState.delete(userId); state.scheduledPlaybackTime.delete(userId); clearInterval(interval); } return; }
      const data = q.shift();
      const buf = state.audioContext.createBuffer(1, data.length, config.sampleRate);
      buf.getChannelData(0).set(data);
      const src = state.audioContext.createBufferSource();
      src.buffer = buf;
      src.connect(gainNode);
      let t = state.scheduledPlaybackTime.get(userId);
      if (t < state.audioContext.currentTime) t = state.audioContext.currentTime;
      src.start(t);
      state.scheduledPlaybackTime.set(userId, t + data.length / config.sampleRate);
    }, 20);
  },
  pause: () => {
    const userId = Array.from(state.activeSpeakers)[0];
    if (userId && state.audioSources.has(userId)) {
      state.pausedAudioBuffer = state.audioBuffers.get(userId) ? [...state.audioBuffers.get(userId)] : null;
      state.playbackState.set(userId, 'paused');
      state.audioSources.delete(userId);
      state.audioBuffers.set(userId, []);
      state.scheduledPlaybackTime.delete(userId);
    }
  },
  resume: () => {
    if (!state.pausedAudioBuffer) return;
    const userId = Array.from(state.activeSpeakers)[0];
    if (userId) { state.audioBuffers.set(userId, state.pausedAudioBuffer); state.playbackState.set(userId, 'playing'); audio.play(userId); state.pausedAudioBuffer = null; }
  },
  replay: (msgId) => {
    const chunks = state.audioHistory.get(msgId);
    if (!chunks?.length) return;
    const id = 'replay-' + msgId;
    if (!state.audioDecoders.has(id)) state.audioDecoders.set(id, audio.createDecoder(id));
    chunks.forEach(c => state.audioDecoders.get(id).decode(new EncodedAudioChunk({ type: 'key', timestamp: performance.now() * 1000, data: c })));
  },
  pauseAll: () => {
    state.pausedBuffers = new Map();
    state.audioSources.forEach((s, id) => {
      const b = state.audioBuffers.get(id);
      if (b?.length) state.pausedBuffers.set(id, [...b]);
      state.audioBuffers.set(id, []);
      state.playbackState.set(id, 'paused');
    });
    state.audioSources.clear();
    state.scheduledPlaybackTime.clear();
  },
  resumeAll: () => {
    if (state.pausedBuffers) {
      state.pausedBuffers.forEach((b, id) => {
        if (b.length) { state.audioBuffers.set(id, [...b, ...(state.audioBuffers.get(id) || [])]); state.playbackState.set(id, 'playing'); if (state.activeSpeakers.has(id) || state.audioBuffers.get(id)?.length) audio.play(id); }
      });
      state.pausedBuffers = null;
    }
    state.activeSpeakers.forEach(id => { if (!state.audioSources.has(id) && state.audioBuffers.get(id)?.length) { state.playbackState.set(id, 'playing'); audio.play(id); } });
  },
  skipLive: () => {
    state.skipLiveAudio = true;
    state.currentLiveSpeaker = null;
    state.audioSources.forEach(s => s.gainNode.disconnect());
    state.audioSources.clear();
    state.audioBuffers.clear();
    state.audioDecoders.forEach(d => { try { d.close(); } catch (e) {} });
    state.audioDecoders.clear();
    state.playbackState.clear();
    state.scheduledPlaybackTime.clear();
    webcam.hidePlayback();
    state.activeSpeakers.forEach(id => { const s = state.activeSegments.get(id); if (s) s.playedRealtime = false; });
    ui.render.queue();
  },
  resumeLive: () => { state.skipLiveAudio = false; state.currentLiveSpeaker = null; ui.render.queue(); }
};
window.audio = audio;
