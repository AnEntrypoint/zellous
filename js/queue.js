const queue = {
  addSegment: (userId, username, isOwnAudio = false) => {
    const segment = { id: state.nextSegmentId++, userId, username, timestamp: new Date(), status: 'recording', chunks: [], decodedSamples: [], isOwnAudio, playedRealtime: false, videoChunks: [] };
    state.activeSegments.set(userId, segment);
    return segment;
  },
  addChunk: (userId, data) => {
    const s = state.activeSegments.get(userId);
    if (s) { s.chunks.push(new Uint8Array(data)); if (s.chunks.length % 10 === 0) ui.render.queue(); return true; }
    return false;
  },
  completeSegment: (userId) => {
    const s = state.activeSegments.get(userId);
    if (s?.chunks.length) { s.status = (s.isOwnAudio || s.playedRealtime) ? 'played' : 'queued'; state.audioQueue.push(s); state.activeSegments.delete(userId); ui.render.queue(); }
    else state.activeSegments.delete(userId);
  },
  getNextQueuedSegment: () => state.audioQueue.find(s => s.status === 'queued'),
  markAsPlaying: (id) => { const s = state.audioQueue.find(x => x.id === id); if (s) { s.status = 'playing'; state.currentSegmentId = id; ui.render.queue(); } },
  markAsPlayed: (id) => { const s = state.audioQueue.find(x => x.id === id); if (s) { s.status = 'played'; state.currentSegmentId = null; ui.render.queue(); queue.playNext(); } },
  playNext: () => {
    if (state.isSpeaking || state.isDeafened || state.currentSegmentId || state.replayingSegmentId) return;
    const next = queue.getNextQueuedSegment();
    if (next) { queue.markAsPlaying(next.id); queue.decodeAndPlay(next); return; }
    if (!state.currentLiveSpeaker && !state.skipLiveAudio && state.activeSpeakers.size > 0) { const validSpeakers = Array.from(state.activeSpeakers).filter(id => state.activeSegments.has(id)); if (validSpeakers.length > 0) { state.currentLiveSpeaker = validSpeakers[0]; ui.render.queue(); } }
  },
  decodeAndPlay: (segment) => {
    const decoder = new AudioDecoder({
      output: (d) => { const b = new ArrayBuffer(d.allocationSize({ planeIndex: 0 })); d.copyTo(b, { planeIndex: 0 }); segment.decodedSamples.push(new Float32Array(b)); d.close(); },
      error: () => {}
    });
    decoder.configure({ codec: 'opus', sampleRate: config.sampleRate, numberOfChannels: 1 });
    segment.chunks.forEach((c, i) => { try { decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: i * 20000, data: c })); } catch (e) {} });
    decoder.flush().then(() => { queue.playSamples(segment); decoder.close(); }).catch(() => { decoder.close(); queue.markAsPlayed(segment.id); });
  },
  playSamples: (s) => {
    if (!s.decodedSamples.length) { queue.markAsPlayed(s.id); return; }
    if (state.audioContext?.state === 'suspended') state.audioContext.resume();
    const g = state.audioContext.createGain(); g.gain.value = state.masterVolume; g.connect(state.audioContext.destination);
    let t = state.audioContext.currentTime + 0.05;
    s.decodedSamples.forEach(d => { const b = state.audioContext.createBuffer(1, d.length, config.sampleRate); b.getChannelData(0).set(d); const src = state.audioContext.createBufferSource(); src.buffer = b; src.connect(g); src.start(t); t += d.length / config.sampleRate; });
    setTimeout(() => queue.markAsPlayed(s.id), (t - state.audioContext.currentTime) * 1000);
  },
  pausePlayback: () => {},
  resumePlayback: () => { if (!state.currentSegmentId) queue.playNext(); },
  stopReplay: () => {
    if (state.replayGainNode) { state.replayGainNode.disconnect(); state.replayGainNode = null; }
    if (state.replayTimeout) { clearTimeout(state.replayTimeout); state.replayTimeout = null; }
    state.replayingSegmentId = null;
    webcam.hidePlayback();
  },
  replaySegment: (id, cont = true) => {
    const idx = state.audioQueue.findIndex(s => s.id === id);
    const s = state.audioQueue[idx];
    if (!s?.chunks.length) return;
    queue.stopReplay();
    state.replayingSegmentId = id;
    ui.render.queue();
    const samples = [];
    const decoder = new AudioDecoder({ output: (d) => { const b = new ArrayBuffer(d.allocationSize({ planeIndex: 0 })); d.copyTo(b, { planeIndex: 0 }); samples.push(new Float32Array(b)); d.close(); }, error: () => {} });
    decoder.configure({ codec: 'opus', sampleRate: config.sampleRate, numberOfChannels: 1 });
    s.chunks.forEach(c => decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: performance.now() * 1000, data: c })));
    decoder.flush().then(() => {
      if (!samples.length) { decoder.close(); state.replayingSegmentId = null; return; }
      const g = state.audioContext.createGain(); g.gain.value = state.masterVolume; g.connect(state.audioContext.destination);
      state.replayGainNode = g;
      let t = state.audioContext.currentTime + 0.05, dur = 0;
      samples.forEach(d => { const b = state.audioContext.createBuffer(1, d.length, config.sampleRate); b.getChannelData(0).set(d); const src = state.audioContext.createBufferSource(); src.buffer = b; src.connect(g); src.start(t); dur += d.length / config.sampleRate; t += d.length / config.sampleRate; });
      if (s.videoChunks?.length) webcam.showVideo(s.videoChunks, s.username);
      decoder.close();
      state.replayTimeout = setTimeout(() => { state.replayGainNode = null; state.replayTimeout = null; state.replayingSegmentId = null; webcam.hidePlayback(); ui.render.queue(); if (cont && idx + 1 < state.audioQueue.length) queue.replaySegment(state.audioQueue[idx + 1].id, true); }, dur * 1000 + 50);
    });
  },
  downloadSegment: (id) => {
    const s = state.audioQueue.find(x => x.id === id);
    if (!s?.chunks.length) return;
    const samples = [];
    const decoder = new AudioDecoder({ output: (d) => { const b = new ArrayBuffer(d.allocationSize({ planeIndex: 0 })); d.copyTo(b, { planeIndex: 0 }); samples.push(new Float32Array(b)); d.close(); }, error: () => {} });
    decoder.configure({ codec: 'opus', sampleRate: config.sampleRate, numberOfChannels: 1 });
    s.chunks.forEach(c => decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: performance.now() * 1000, data: c })));
    decoder.flush().then(() => {
      decoder.close();
      if (!samples.length) return;
      const len = samples.reduce((sum, a) => sum + a.length, 0);
      const wav = new ArrayBuffer(44 + len * 2);
      const v = new DataView(wav);
      const ws = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
      ws(0, 'RIFF'); v.setUint32(4, 36 + len * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, config.sampleRate, true); v.setUint32(28, config.sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, len * 2, true);
      let o = 44;
      samples.forEach(arr => arr.forEach(x => { v.setInt16(o, Math.max(-1, Math.min(1, x)) * (x < 0 ? 0x8000 : 0x7FFF), true); o += 2; }));
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })); a.download = `${s.username}-${s.timestamp.toISOString().slice(0,19).replace(/:/g,'-')}.wav`; a.click();
      if (s.videoChunks?.length) { const va = document.createElement('a'); va.href = URL.createObjectURL(new Blob(s.videoChunks, { type: 'video/webm' })); va.download = `${s.username}-${s.timestamp.toISOString().slice(0,19).replace(/:/g,'-')}.webm`; va.click(); }
    });
  }
};
window.queue = queue;
