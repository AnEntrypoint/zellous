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
  // New elements
  chatView: document.getElementById('chatView'),
  chatInput: document.getElementById('chatInput'),
  chatSendBtn: document.getElementById('chatSendBtn'),
  fileInput: document.getElementById('fileInput'),
  authBtn: document.getElementById('authBtn'),
  authModal: document.getElementById('authModal'),
  filesView: document.getElementById('filesView'),

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
    if (state.messages.length === 0) {
      ui.messages.innerHTML = '<div class="empty">No messages yet</div>';
      return;
    }
    ui.messages.innerHTML = state.messages.map(m => `<div class="msg"><div class="msg-text">${m.text}</div><div class="msg-time">${m.time}${m.hasAudio ? `<button class="msg-replay" data-msg-id="${m.id}">▶</button>` : ''}</div></div>`).join('');
    ui.messages.scrollTop = ui.messages.scrollHeight;
    document.querySelectorAll('.msg-replay').forEach(btn => btn.addEventListener('click', (e) => {
      const msgId = parseFloat(e.target.dataset.msgId);
      const msg = state.messages.find(m => m.id === msgId);
      if (msg?.userId) {
        const segment = state.audioQueue.find(s => s.userId === msg.userId && Math.abs(s.timestamp.getTime() - msgId) < 5000);
        if (segment) {
          queue.replaySegment(segment.id, false);
          return;
        }
      }
      audio.replay(msgId);
    }));
  },

  roomName: () => {
    ui.roomName.textContent = state.roomId;
  },

  queue: () => {
    const all = [...Array.from(state.activeSegments.values()), ...state.audioQueue];
    if (all.length === 0) {
      ui.audioQueueView.innerHTML = '<div class="empty">Queue empty</div>';
      return;
    }
    let html = state.activeSpeakers.size > 0 && !state.skipLiveAudio
      ? '<button class="skip-btn" id="skipLiveBtn">⏭ Skip Live</button>'
      : (state.skipLiveAudio && state.activeSpeakers.size > 0 ? '<button class="skip-btn resume" id="resumeLiveBtn">▶ Resume Live</button>' : '');

    all.forEach(s => {
      const replaying = state.replayingSegmentId === s.id;
      const icon = replaying ? '🔊' : { recording: '🔴', queued: '⏸', playing: '▶', played: '✓' }[s.status] || '•';
      const clickable = s.chunks.length > 0 && s.status !== 'recording';
      html += `<div class="queue-item ${s.status}${replaying ? ' replaying' : ''}"><span class="queue-icon">${icon}</span><div class="queue-info"><div class="queue-name">${s.username}${s.isOwnAudio ? ' (You)' : ''}${s.videoChunks?.length ? ' 📹' : ''}</div><div class="queue-meta">${s.timestamp.toLocaleTimeString()} · ${s.chunks.length}</div></div>${clickable ? `<div class="queue-actions"><button class="queue-btn" data-play="${s.id}">▶</button><button class="queue-btn" data-dl="${s.id}">⬇</button></div>` : ''}</div>`;
    });
    ui.audioQueueView.innerHTML = html;
    document.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      queue.replaySegment(parseInt(b.dataset.play), true);
    }));
    document.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      queue.downloadSegment(parseInt(b.dataset.dl));
    }));
    document.getElementById('skipLiveBtn')?.addEventListener('click', () => audio.skipLive());
    document.getElementById('resumeLiveBtn')?.addEventListener('click', () => audio.resumeLive());
  },

  // Chat rendering
  chat: () => {
    if (!ui.chatView) return;
    if (chat.messages.length === 0) {
      ui.chatView.innerHTML = '<div class="empty">No chat messages yet</div>';
      return;
    }

    const html = chat.messages.map(m => {
      const time = chat.formatTime(m.timestamp);
      const userClass = m.isAuthenticated ? 'authenticated' : '';
      let content = '';

      switch (m.type) {
        case 'text':
          content = `<div class="chat-text">${chat.linkify(m.content)}</div>`;
          break;
        case 'image':
          content = chat.createImagePreview(m);
          break;
        case 'file':
          content = chat.createFileAttachment(m);
          break;
        default:
          content = `<div class="chat-text">${chat.escapeHtml(m.content || '')}</div>`;
      }

      return `<div class="chat-msg ${userClass}">
        <div class="chat-header">
          <span class="chat-username">${chat.escapeHtml(m.username || 'User')}</span>
          <span class="chat-time">${time}</span>
        </div>
        ${content}
      </div>`;
    }).join('');

    ui.chatView.innerHTML = html;
    ui.chatView.scrollTop = ui.chatView.scrollHeight;
  },

  // Files rendering
  files: () => {
    if (!ui.filesView) return;
    if (state.fileList.length === 0) {
      ui.filesView.innerHTML = '<div class="empty">No files in this folder</div>';
      return;
    }

    let html = state.currentFilePath
      ? `<div class="file-item folder" onclick="ui.actions.browseFiles('..')"><span class="file-icon">📁</span><span class="file-name">..</span></div>`
      : '';

    state.fileList.forEach(f => {
      if (f.type === 'directory') {
        html += `<div class="file-item folder" onclick="ui.actions.browseFiles('${f.name}')">
          <span class="file-icon">📁</span>
          <span class="file-name">${chat.escapeHtml(f.name)}</span>
        </div>`;
      } else {
        const icon = chat.getFileIcon(f.mimeType);
        html += `<div class="file-item">
          <span class="file-icon">${icon}</span>
          <div class="file-info">
            <span class="file-name">${chat.escapeHtml(f.originalName)}</span>
            <span class="file-size">${chat.formatSize(f.size)}</span>
          </div>
          <button class="file-dl-btn" onclick="fileTransfer.download('${f.id}', '${f.originalName}')">⬇</button>
        </div>`;
      }
    });

    ui.filesView.innerHTML = html;
  },

  // Auth status
  authStatus: () => {
    if (!ui.authBtn) return;
    if (state.isAuthenticated && state.currentUser) {
      ui.authBtn.textContent = state.currentUser.displayName || state.currentUser.username;
      ui.authBtn.classList.add('authenticated');
    } else {
      ui.authBtn.textContent = 'Login';
      ui.authBtn.classList.remove('authenticated');
    }
  }
};

// UI Actions
ui.actions = {
  sendChat: () => {
    const input = ui.chatInput;
    if (!input) return;
    const content = input.value.trim();
    if (content) {
      chat.send(content);
      input.value = '';
    }
  },

  uploadFile: () => {
    ui.fileInput?.click();
  },

  handleFileSelect: (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        chat.sendImage(file);
      } else {
        fileTransfer.upload(file);
      }
    }
    e.target.value = '';
  },

  browseFiles: (path) => {
    let newPath = state.currentFilePath;
    if (path === '..') {
      newPath = newPath.split('/').slice(0, -1).join('/');
    } else {
      newPath = newPath ? `${newPath}/${path}` : path;
    }
    network.send({ type: 'get_files', path: newPath });
  },

  showAuthModal: () => {
    if (ui.authModal) {
      ui.authModal.classList.add('open');
    }
  },

  hideAuthModal: () => {
    if (ui.authModal) {
      ui.authModal.classList.remove('open');
    }
  },

  login: async (username, password) => {
    try {
      await auth.login(username, password);
      ui.actions.hideAuthModal();
      ui.render.authStatus();
    } catch (e) {
      alert(e.message);
    }
  },

  register: async (username, password, displayName) => {
    try {
      await auth.register(username, password, displayName);
      await auth.login(username, password);
      ui.actions.hideAuthModal();
      ui.render.authStatus();
    } catch (e) {
      alert(e.message);
    }
  },

  logout: async () => {
    await auth.logout();
    ui.render.authStatus();
  }
};

window.ui = ui;
