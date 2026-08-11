const webcam = {
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
        ui.videoPlaybackVideo.play().catch((e) => { if (window.ui?.showToast) ui.showToast('Playback blocked: ' + e.message, 'error'); });
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
window.__zellous.webcam = webcam;
window.webcam = webcam;
