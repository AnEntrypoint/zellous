const ptt = {
  start: () => {
    state.isSpeaking = true;
    ui.ptt.classList.add('recording');
    ui.recordingIndicator.style.display = 'inline';
    if (state.audioContext?.state === 'suspended') state.audioContext.resume();
    audio.pauseAll();
    webcam.hidePlayback();
    state.ownAudioChunks = [];
    state.ownVideoChunks = [];
    if (state.userId) queue.addSegment(state.userId, 'You', true);
    if (state.webcamEnabled) webcam.startCapture();
    network.send({ type: 'audio_start' });
  },
  stop: async () => {
    state.isSpeaking = false;
    ui.ptt.classList.remove('recording');
    ui.recordingIndicator.style.display = 'none';
    webcam.stopCapture();
    if (state.audioEncoder?.state === 'configured') try { await state.audioEncoder.flush(); } catch (e) {}
    network.send({ type: 'audio_end' });
    if (state.userId) {
      const s = state.activeSegments.get(state.userId);
      if (s) { s.chunks = [...state.ownAudioChunks]; s.videoChunks = [...state.ownVideoChunks]; }
      queue.completeSegment(state.userId);
    }
    audio.resumeAll();
    queue.resumePlayback();
  }
};
const deafen = {
  toggle: () => { state.isDeafened = !state.isDeafened; state.isDeafened ? deafen.activate() : deafen.deactivate(); },
  activate: () => { ui.deafenBtn.classList.add('active'); ui.deafenBtn.innerHTML = '🔇 Deafened'; ui.render.queue(); },
  deactivate: () => { ui.deafenBtn.classList.remove('active'); ui.deafenBtn.innerHTML = '🔊 Deafen'; queue.resumePlayback(); ui.render.queue(); }
};
const vad = {
  toggle: () => { state.vadEnabled = !state.vadEnabled; state.vadEnabled ? vad.activate() : vad.deactivate(); },
  activate: () => {
    ui.vadBtn.classList.add('active');
    ui.vadBtn.innerHTML = '🎤 VAD Active';
    ui.vadControls.style.display = 'flex';
    ui.vadMeterContainer.style.display = 'block';
    ui.ptt.innerHTML = 'VAD MODE';
    ui.ptt.style.pointerEvents = 'none';
    ui.ptt.style.opacity = '0.6';
    vad.startMonitoring();
  },
  deactivate: () => {
    ui.vadBtn.classList.remove('active');
    ui.vadBtn.innerHTML = '🎤 Voice Activation';
    ui.vadControls.style.display = 'none';
    ui.vadMeterContainer.style.display = 'none';
    ui.ptt.innerHTML = 'HOLD TO TALK';
    ui.ptt.style.pointerEvents = 'auto';
    ui.ptt.style.opacity = '1';
    vad.stopMonitoring();
    if (state.isSpeaking) ptt.stop();
  },
  startMonitoring: () => {
    if (!state.audioContext || !state.mediaStream) return;
    if (!state.vadAnalyser) {
      state.vadAnalyser = state.audioContext.createAnalyser();
      state.vadAnalyser.fftSize = 512;
      state.vadAnalyser.smoothingTimeConstant = 0.3;
      state.audioContext.createMediaStreamSource(state.mediaStream).connect(state.vadAnalyser);
    }
    const data = new Uint8Array(state.vadAnalyser.frequencyBinCount);
    const check = () => {
      if (!state.vadEnabled) return;
      state.vadAnalyser.getByteFrequencyData(data);
      let sum = 0; for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length) / 255;
      ui.vadMeter.style.width = (rms * 100) + '%';
      if (rms > state.vadThreshold) {
        if (state.vadSilenceTimer) { clearTimeout(state.vadSilenceTimer); state.vadSilenceTimer = null; }
        if (!state.isSpeaking) ptt.start();
      } else if (state.isSpeaking && !state.vadSilenceTimer) {
        state.vadSilenceTimer = setTimeout(() => { if (state.vadEnabled && state.isSpeaking) ptt.stop(); state.vadSilenceTimer = null; }, state.vadSilenceDelay);
      }
      requestAnimationFrame(check);
    };
    check();
  },
  stopMonitoring: () => { if (state.vadSilenceTimer) { clearTimeout(state.vadSilenceTimer); state.vadSilenceTimer = null; } },
  setThreshold: (v) => { state.vadThreshold = v / 100; ui.vadThresholdMarker.style.left = v + '%'; }
};
window.ptt = ptt;
window.deafen = deafen;
window.vad = vad;
