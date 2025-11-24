const webcam = {
  toggle: async () => { state.webcamEnabled ? webcam.disable() : await webcam.enable(); },
  enable: async () => {
    try {
      const [w, h] = state.webcamResolution.split('x').map(Number);
      state.webcamStream = await navigator.mediaDevices.getUserMedia({ video: { width: w, height: h, frameRate: state.webcamFps, facingMode: 'user' } });
      ui.webcamVideo.srcObject = state.webcamStream;
      ui.webcamPreview.style.display = 'block';
      ui.webcamBtn.classList.add('active');
      ui.webcamBtn.innerHTML = '📷 Webcam On';
      state.webcamEnabled = true;
    } catch (e) { ui.webcamBtn.innerHTML = '📷 Webcam Denied'; }
  },
  disable: () => {
    if (state.webcamStream) { state.webcamStream.getTracks().forEach(t => t.stop()); state.webcamStream = null; }
    ui.webcamVideo.srcObject = null;
    ui.webcamPreview.style.display = 'none';
    ui.webcamBtn.classList.remove('active');
    ui.webcamBtn.innerHTML = '📷 Webcam Off';
    state.webcamEnabled = false;
    webcam.stopCapture();
  },
  startCapture: () => {
    if (!state.webcamEnabled || !state.webcamStream) return;
    state.ownVideoChunks = [];
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4';
    const [w, h] = state.webcamResolution.split('x').map(Number);
    state.webcamRecorder = new MediaRecorder(state.webcamStream, { mimeType: mime, videoBitsPerSecond: Math.round(w * h * state.webcamFps * 0.1) });
    state.webcamRecorder.ondataavailable = (e) => { if (e.data.size > 0) e.data.arrayBuffer().then(b => { const d = new Uint8Array(b); state.ownVideoChunks.push(d); network.send({ type: 'video_chunk', data: d }); }); };
    state.webcamRecorder.start(500);
  },
  stopCapture: () => { if (state.webcamRecorder?.state !== 'inactive') { state.webcamRecorder?.stop(); state.webcamRecorder = null; } },
  showVideo: (chunks, username) => {
    if (!chunks?.length) { ui.videoPlayback.style.display = 'none'; return; }
    if (ui.videoPlaybackVideo.src) URL.revokeObjectURL(ui.videoPlaybackVideo.src);
    ui.videoPlaybackVideo.src = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    ui.videoPlaybackVideo.play();
    ui.videoPlaybackLabel.textContent = username || 'Unknown';
    ui.videoPlayback.style.display = 'block';
  },
  streamChunk: (userId, chunk, username) => {
    if (!state.liveVideoChunks) state.liveVideoChunks = new Map();
    if (!state.liveVideoChunks.has(userId)) state.liveVideoChunks.set(userId, []);
    state.liveVideoChunks.get(userId).push(chunk);
    ui.videoPlaybackLabel.textContent = username || 'Unknown';
    ui.videoPlayback.style.display = 'block';
    if (!state.liveVideoInterval) {
      state.liveVideoInterval = setInterval(() => {
        if (!state.currentLiveSpeaker || !state.liveVideoChunks?.has(state.currentLiveSpeaker)) return;
        const c = state.liveVideoChunks.get(state.currentLiveSpeaker);
        if (!c.length) return;
        const old = ui.videoPlaybackVideo.src;
        ui.videoPlaybackVideo.src = URL.createObjectURL(new Blob(c, { type: 'video/webm' }));
        ui.videoPlaybackVideo.currentTime = Math.max(0, ui.videoPlaybackVideo.duration - 0.5) || 0;
        ui.videoPlaybackVideo.play().catch(() => {});
        if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
      }, 1000);
    }
  },
  hidePlayback: () => {
    ui.videoPlayback.style.display = 'none';
    if (ui.videoPlaybackVideo.src) { ui.videoPlaybackVideo.pause(); URL.revokeObjectURL(ui.videoPlaybackVideo.src); ui.videoPlaybackVideo.src = ''; }
    if (state.liveVideoInterval) { clearInterval(state.liveVideoInterval); state.liveVideoInterval = null; }
    if (state.liveVideoChunks) state.liveVideoChunks.clear();
  }
};
window.webcam = webcam;
