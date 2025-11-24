const ui = {
  ptt: document.getElementById('pttBtn'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  recordingIndicator: document.getElementById('recording'),
  volumeSlider: document.getElementById('volume'),
  volumeValue: document.getElementById('volValue'),
  speakers: document.getElementById('speakers'),
  messages: document.getElementById('messages'),
  roomName: document.getElementById('roomName'),
  audioQueueView: document.getElementById('audioQueueView'),
  deafenBtn: document.getElementById('deafenBtn'),
  vadBtn: document.getElementById('vadBtn'),
  vadControls: document.getElementById('vadControls'),
  vadThreshold: document.getElementById('vadThreshold'),
  vadValue: document.getElementById('vadValue'),
  vadMeterContainer: document.getElementById('vadMeterContainer'),
  vadMeter: document.getElementById('vadMeter'),
  vadThresholdMarker: document.getElementById('vadThresholdMarker'),
  webcamBtn: document.getElementById('webcamBtn'),
  webcamPreview: document.getElementById('webcamPreview'),
  webcamVideo: document.getElementById('webcamVideo'),
  webcamResolution: document.getElementById('webcamResolution'),
  webcamFps: document.getElementById('webcamFps'),
  inputDevice: document.getElementById('inputDevice'),
  outputDevice: document.getElementById('outputDevice'),
  videoPlayback: document.getElementById('videoPlayback'),
  videoPlaybackVideo: document.getElementById('videoPlaybackVideo'),
  videoPlaybackLabel: document.getElementById('videoPlaybackLabel'),
  setStatus: (text, isError) => {
    ui.statusDot.className = isError ? 'connection-dot offline' : 'connection-dot';
    ui.statusText.textContent = text;
  }
};
ui.render = {
  speakers: () => {
    ui.speakers.innerHTML = state.activeSpeakers.size === 0 ? '<div class="empty">No active speakers</div>' :
      Array.from(state.activeSpeakers).map(id => `<div class="speaker"><div class="speaker-dot"></div><div class="speaker-name">User${id}</div></div>`).join('');
  },
  messages: () => {
    if (state.messages.length === 0) { ui.messages.innerHTML = '<div class="empty">No messages yet</div>'; return; }
    ui.messages.innerHTML = state.messages.map(m => `<div class="msg"><div class="msg-text">${m.text}</div><div class="msg-time">${m.time}${m.hasAudio ? `<button class="msg-replay" data-msg-id="${m.id}">▶</button>` : ''}</div></div>`).join('');
    ui.messages.scrollTop = ui.messages.scrollHeight;
    document.querySelectorAll('.msg-replay').forEach(btn => btn.addEventListener('click', (e) => audio.replay(parseFloat(e.target.dataset.msgId))));
  },
  roomName: () => { ui.roomName.textContent = state.roomId; },
  queue: () => {
    const all = [...Array.from(state.activeSegments.values()), ...state.audioQueue];
    if (all.length === 0) { ui.audioQueueView.innerHTML = '<div class="empty">Queue empty</div>'; return; }
    let html = state.activeSpeakers.size > 0 && !state.skipLiveAudio ? '<button class="skip-btn" id="skipLiveBtn">⏭ Skip Live</button>' :
      (state.skipLiveAudio && state.activeSpeakers.size > 0 ? '<button class="skip-btn resume" id="resumeLiveBtn">▶ Resume Live</button>' : '');
    all.forEach(s => {
      const replaying = state.replayingSegmentId === s.id;
      const icon = replaying ? '🔊' : { recording: '🔴', queued: '⏸', playing: '▶', played: '✓' }[s.status] || '•';
      const clickable = s.chunks.length > 0 && s.status !== 'recording';
      html += `<div class="queue-item ${s.status}${replaying ? ' replaying' : ''}"><span class="queue-icon">${icon}</span><div class="queue-info"><div class="queue-name">${s.username}${s.isOwnAudio ? ' (You)' : ''}${s.videoChunks?.length ? ' 📹' : ''}</div><div class="queue-meta">${s.timestamp.toLocaleTimeString()} · ${s.chunks.length}</div></div>${clickable ? `<div class="queue-actions"><button class="queue-btn" data-play="${s.id}">▶</button><button class="queue-btn" data-dl="${s.id}">⬇</button></div>` : ''}</div>`;
    });
    ui.audioQueueView.innerHTML = html;
    document.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); queue.replaySegment(parseInt(b.dataset.play), true); }));
    document.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); queue.downloadSegment(parseInt(b.dataset.dl)); }));
    document.getElementById('skipLiveBtn')?.addEventListener('click', () => audio.skipLive());
    document.getElementById('resumeLiveBtn')?.addEventListener('click', () => audio.resumeLive());
  }
};
window.ui = ui;
