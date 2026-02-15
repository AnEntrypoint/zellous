const ui = {
  // DOM references
  ptt: document.getElementById('pttBtn'),
  pttStatus: document.getElementById('pttStatus'),
  pttStatusText: document.getElementById('pttStatusText'),
  volumeSlider: document.getElementById('volume'),
  volumeValue: document.getElementById('volValue'),
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
  webcamControls: document.getElementById('webcamControls'),
  inputDevice: document.getElementById('inputDevice'),
  outputDevice: document.getElementById('outputDevice'),
  videoPlayback: document.getElementById('videoPlayback'),
  videoPlaybackVideo: document.getElementById('videoPlaybackVideo'),
  videoPlaybackLabel: document.getElementById('videoPlaybackLabel'),
  chatInput: document.getElementById('chatInput'),
  chatMessages: document.getElementById('chatMessages'),
  chatMessagesInner: document.getElementById('chatMessagesInner'),
  fileInput: document.getElementById('fileInput'),
  audioQueueView: document.getElementById('audioQueueView'),
  // Discord layout elements
  channelList: document.getElementById('channelList'),
  memberList: document.getElementById('memberList'),
  onlineMembers: document.getElementById('onlineMembers'),
  onlineHeader: document.getElementById('onlineHeader'),
  chatHeaderName: document.getElementById('chatHeaderName'),
  chatHeaderIcon: document.getElementById('chatHeaderIcon'),
  chatHeaderTopic: document.getElementById('chatHeaderTopic'),
  chatArea: document.getElementById('chatArea'),
  voiceView: document.getElementById('voiceView'),
  voiceGrid: document.getElementById('voiceGrid'),
  threadedView: document.getElementById('threadedView'),
  voicePanel: document.getElementById('voicePanel'),
  voicePanelChannel: document.getElementById('voicePanelChannel'),
  serverHeader: document.getElementById('serverHeader'),
  authModal: document.getElementById('authModal'),
  authError: document.getElementById('authError'),
  userPanelName: document.getElementById('userPanelName'),
  userPanelTag: document.getElementById('userPanelTag'),
  userPanelAvatar: document.getElementById('userPanelAvatar'),
  userStatusDot: document.getElementById('userStatusDot'),
  mobileTitle: document.getElementById('mobileTitle'),
  channelSidebar: document.getElementById('channelSidebar'),
  drawerOverlay: document.getElementById('drawerOverlay'),
  settingsPopover: document.getElementById('settingsPopover'),
};

// Helper: get initials from username
const getInitial = (name) => (name || '?')[0].toUpperCase();

// Helper: get avatar color from user id/name
const avatarColors = ['#5865f2','#57f287','#feb347','#fe7168','#9b59b6','#1abc9c','#e67e22','#e74c3c'];
const getAvatarColor = (id) => avatarColors[Math.abs(typeof id === 'number' ? id : (id||'').length) % avatarColors.length];

// Format timestamp Discord style
const formatTime = (ts) => {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return 'Today at ' + time;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday at ' + time;
  return d.toLocaleDateString() + ' ' + time;
};

ui.render = {
  all() {
    this.channels();
    this.members();
    this.chat();
    this.queue();
    this.authStatus();
    this.channelView();
    this.voicePanel();
  },

  messages() {
    if (!ui.chatMessagesInner) return;
    const sysMessages = state.messages || [];
    if (sysMessages.length === 0) return;
    const chatMsgs = chat?.messages || [];
    if (chatMsgs.length > 0) return;
    let html = '';
    sysMessages.forEach(m => {
      html += `<div class="msg-system"><span class="msg-system-icon">\u2192</span>${m.text} <span class="msg-timestamp">${m.time}</span></div>`;
    });
    ui.chatMessagesInner.innerHTML = html;
    ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
  },

  speakers() {
    ui.render.voiceGrid?.();
    ui.render.channels?.();
  },

  channels() {
    if (!ui.channelList) return;
    const ch = state.channels;
    const current = state.currentChannel;
    let html = '';

    const catHtml = (label, type) => `<div class="category-header"><svg class="category-arrow" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>${label}<button class="category-add-btn" data-add-type="${type}" title="Create Channel">+</button></div>`;
    const icons = { text: '#', voice: '&#128264;', threaded: '&#128203;' };
    const groups = [
      { label: 'TEXT CHANNELS', type: 'text' },
      { label: 'VOICE CHANNELS', type: 'voice' },
      { label: 'THREADED CHANNELS', type: 'threaded' }
    ];

    groups.forEach(g => {
      const filtered = ch.filter(c => c.type === g.type);
      if (!filtered.length && g.type !== 'text') return;
      html += catHtml(g.label, g.type);
      filtered.forEach(c => {
        html += `<div class="channel-item${current.id === c.id ? ' active' : ''}" data-channel="${c.id}" data-type="${c.type}">
          <span class="channel-icon">${icons[c.type] || '#'}</span>
          <span class="channel-name">${c.name}</span>
        </div>`;
        if (g.type === 'voice' && state.voiceConnected && state.voiceChannelName === c.name) {
          html += '<div class="voice-users">';
          (state.voiceParticipants || []).forEach(p => {
            const speaking = p.isSpeaking ? ' speaking' : '';
            html += `<div class="voice-user">
              <div class="voice-user-avatar${speaking}" style="background:${getAvatarColor(p.identity)}">${getInitial(p.identity)}</div>
              <span>${p.identity}</span>
            </div>`;
          });
          html += '</div>';
        }
      });
    });

    ui.channelList.innerHTML = html;

    ui.channelList.querySelectorAll('.channel-item').forEach(el => {
      el.addEventListener('click', () => {
        const ch = state.channels.find(c => c.id === el.dataset.channel);
        if (ch) ui.actions.switchChannel(ch);
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (window.channelManager) channelManager.showContextMenu(el.dataset.channel, e.clientX, e.clientY);
      });
    });
    ui.channelList.querySelectorAll('.category-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.channelManager) channelManager.showCreateModal(btn.dataset.addType);
      });
    });
  },

  channelView() {
    const ch = state.currentChannel;
    if (!ch) return;

    // Hide all views
    ui.chatArea.style.display = 'none';
    ui.voiceView.style.display = 'none';
    ui.threadedView.style.display = 'none';

    // Show the right view
    if (ch.type === 'text') {
      ui.chatArea.style.display = 'flex';
      ui.chatHeaderIcon.textContent = '#';
      ui.chatHeaderName.textContent = ch.name;
      ui.chatInput.placeholder = `Message #${ch.name}`;
    } else if (ch.type === 'voice') {
      ui.voiceView.style.display = 'flex';
      ui.chatHeaderIcon.textContent = '\u{1F508}';
      ui.chatHeaderName.textContent = ch.name;
      this.voiceGrid();
    } else if (ch.type === 'threaded') {
      ui.threadedView.style.display = 'flex';
      ui.chatHeaderIcon.textContent = '\u{1F4CB}';
      ui.chatHeaderName.textContent = ch.name;
    }

    ui.mobileTitle.textContent = (ch.type === 'text' ? '# ' : '') + ch.name;
  },

  voiceGrid() {
    if (!ui.voiceGrid) return;
    const participants = state.voiceParticipants || [];
    if (participants.length === 0 && !state.voiceConnected) {
      ui.voiceGrid.innerHTML = '<div class="empty-state voice-join-prompt" style="cursor:pointer">Click to join voice channel</div>';
      ui.voiceGrid.querySelector('.voice-join-prompt')?.addEventListener('click', () => {
        const ch = state.currentChannel;
        if (!ch || ch.type !== 'voice') return;
        if (window.lk?._unavailable) {
          ui.voiceGrid.innerHTML = '<div class="empty-state" style="color:var(--status-danger)">Voice server unavailable</div>';
          return;
        }
        if (window.lk) {
          const forceRelay = localStorage.getItem('zellous_forceRelay') === 'true';
          lk.connect(ch.name, { forceRelay });
        }
      });
      return;
    }
    const qDot = (q) => {
      if (!q || q === 'unknown') return '';
      return `<span class="quality-dot ${q}" title="${q}"></span>`;
    };
    ui.voiceGrid.innerHTML = participants.map(p => {
      const speaking = p.isSpeaking ? ' speaking' : '';
      return `<div class="voice-tile">
        <div class="voice-tile-avatar${speaking}" style="background:${getAvatarColor(p.identity)}">
          ${getInitial(p.identity)}
        </div>
        <div class="voice-tile-name">${p.identity} ${qDot(p.connectionQuality)}</div>
        ${p.isMuted ? '<div class="voice-tile-muted">Muted</div>' : ''}
      </div>`;
    }).join('');
  },

  members() {
    if (!ui.onlineMembers) return;
    const members = state.roomMembers || [];
    const online = members.filter(m => m.online !== false);
    ui.onlineHeader.textContent = `ONLINE \u2014 ${online.length}`;
    ui.onlineMembers.innerHTML = online.map(m => {
      const badge = window.moderation && m.role ? moderation.roleLabel(m.role) : '';
      const badgeColor = window.moderation && m.role ? moderation.roleBadgeColor(m.role) : null;
      const badgeHtml = badge ? `<span class="member-role-badge" style="color:${badgeColor || 'var(--text-muted)'}">${badge}</span>` : '';
      return `<div class="member-item" data-member-id="${m.id}" data-member-name="${m.username}">
        <div class="member-avatar" style="background:${getAvatarColor(m.id)}">
          ${getInitial(m.username)}
          <div class="member-status"></div>
        </div>
        <span class="member-name">${m.username}</span>${badgeHtml}
      </div>`;
    }).join('') || '';

    ui.onlineMembers.querySelectorAll('.member-item').forEach(el => {
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (window.moderation && el.dataset.memberId !== String(state.userId)) {
          moderation.showMemberMenu(el.dataset.memberId, el.dataset.memberName, e.clientX, e.clientY);
        }
      });
    });
  },

  chat() {
    if (!ui.chatMessagesInner) return;
    const chatMsgs = chat?.messages || [];
    const sysMsgs = (state.messages || []).map(m => ({
      id: m.id, type: 'system', text: m.text,
      timestamp: new Date(m.time || Date.now()).getTime() || Date.now(),
      userId: m.userId, username: m.username
    }));
    const merged = [...chatMsgs, ...sysMsgs].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    if (merged.length === 0) {
      ui.chatMessagesInner.innerHTML = '<div class="empty-state">No messages yet. Say something!</div>';
      return;
    }

    let html = '';
    let lastUser = null;
    let lastTime = 0;

    merged.forEach(m => {
      if (m.type === 'system') {
        lastUser = null;
        lastTime = 0;
        html += `<div class="msg-system"><span class="msg-system-icon">\u2192</span>${m.text}</div>`;
        return;
      }
      const sameUser = m.userId === lastUser && (m.timestamp - lastTime) < 420000;
      const time = formatTime(m.timestamp);
      const shortTime = new Date(m.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const username = m.username || 'User';
      const color = getAvatarColor(m.userId);
      const pending = m.pending ? ' style="opacity:0.6"' : '';

      if (!sameUser) {
        html += `<div class="msg-group"${pending}>
          <div class="msg-avatar" style="background:${color}">${getInitial(username)}</div>
          <span class="msg-username" style="color:${color}">${chat.escapeHtml(username)}</span>
          <span class="msg-timestamp">${time}</span>`;
      } else {
        html += `<div class="msg-cont"${pending}>
          <span class="msg-hover-time">${shortTime}</span>`;
      }

      switch (m.type) {
        case 'image': html += chat.createImagePreview(m); break;
        case 'file': html += chat.createFileAttachment(m); break;
        default: html += `<div class="msg-content">${chat.linkify(m.content || '')}</div>`;
      }

      html += '</div>';
      lastUser = m.userId;
      lastTime = m.timestamp;
    });

    ui.chatMessagesInner.innerHTML = html;
    ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
  },

  queue() {
    if (!ui.audioQueueView) return;
    const all = [...Array.from(state.activeSegments.values()), ...state.audioQueue];
    if (all.length === 0) {
      ui.audioQueueView.innerHTML = '<div class="empty-state">Queue empty</div>';
      return;
    }
    let html = state.activeSpeakers.size > 0 && !state.skipLiveAudio
      ? '<button class="skip-btn" id="skipLiveBtn">Skip Live</button>'
      : (state.skipLiveAudio && state.activeSpeakers.size > 0 ? '<button class="skip-btn resume" id="resumeLiveBtn">Resume Live</button>' : '');

    all.forEach(s => {
      const replaying = state.replayingSegmentId === s.id;
      const icon = replaying ? '\u{1F50A}' : { recording: '\u{1F534}', queued: '\u23F8', playing: '\u25B6', played: '\u2713' }[s.status] || '\u2022';
      const clickable = s.chunks.length > 0 && s.status !== 'recording';
      html += `<div class="queue-item ${s.status}${replaying ? ' replaying' : ''}">
        <span class="queue-icon">${icon}</span>
        <div class="queue-info">
          <div class="queue-name">${s.username}${s.isOwnAudio ? ' (You)' : ''}${s.videoChunks?.length ? ' \u{1F4F9}' : ''}</div>
          <div class="queue-meta">${s.timestamp.toLocaleTimeString()} \u00B7 ${s.chunks.length} chunks</div>
        </div>
        ${clickable ? `<div class="queue-actions">
          <button class="queue-btn" data-play="${s.id}">\u25B6</button>
          <button class="queue-btn" data-dl="${s.id}">\u2B07</button>
        </div>` : ''}
      </div>`;
    });
    ui.audioQueueView.innerHTML = html;

    ui.audioQueueView.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      queue.replaySegment(parseInt(b.dataset.play), true);
    }));
    ui.audioQueueView.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      queue.downloadSegment(parseInt(b.dataset.dl));
    }));
    document.getElementById('skipLiveBtn')?.addEventListener('click', () => audio.skipLive());
    document.getElementById('resumeLiveBtn')?.addEventListener('click', () => audio.resumeLive());
  },

  voicePanel() {
    if (!state.voiceConnected) return;
    const header = document.querySelector('.voice-panel-header');
    if (!header) return;
    const cs = state.voiceConnectionState;
    if (cs === 'reconnecting') {
      header.innerHTML = '<span style="color:var(--status-warning)">\u25CF</span> Reconnecting\u2026';
    } else if (cs === 'connected') {
      const qc = { excellent: 'var(--status-positive)', good: 'var(--status-positive)', poor: 'var(--status-warning)', lost: 'var(--status-danger)' }[state.voiceConnectionQuality] || 'var(--status-positive)';
      header.innerHTML = `<span style="color:${qc}">\u25CF</span> Voice Connected`;
    } else {
      header.innerHTML = '<span style="color:var(--status-danger)">\u25CF</span> Disconnected';
    }
  },

  authStatus() {
    if (!ui.userPanelName) return;
    if (state.isAuthenticated && state.currentUser) {
      const name = state.currentUser.displayName || state.currentUser.username;
      ui.userPanelName.textContent = name;
      ui.userPanelTag.textContent = '@' + state.currentUser.username;
      ui.userPanelAvatar.childNodes[0].textContent = getInitial(name);
      ui.userStatusDot.classList.add('online');
    } else {
      ui.userPanelName.textContent = 'Not logged in';
      ui.userPanelTag.textContent = 'Click to login';
      ui.userPanelAvatar.childNodes[0].textContent = '?';
      ui.userStatusDot.classList.remove('online');
    }
  }
};

// UI Actions
ui.actions = {
  switchChannel(channel) {
    state.currentChannel = channel;
    ui.render.channels();
    ui.render.channelView();
    // Auto-connect to voice channels via LiveKit
    if (channel.type === 'voice' && !state.voiceConnected && window.lk) {
      const forceRelay = localStorage.getItem('zellous_forceRelay') === 'true';
      lk.connect(channel.name, { forceRelay });
    }
    // Close mobile drawer
    ui.channelSidebar.classList.remove('open');
    ui.drawerOverlay.classList.remove('open');
  },

  showAuthModal() {
    const modal = ui.authModal;
    if (!modal) return;
    modal.classList.add('open');
    ui.authError.style.display = 'none';
    if (auth.isLoggedIn()) {
      document.getElementById('loginForm').style.display = 'none';
      document.getElementById('registerForm').style.display = 'none';
      document.getElementById('userMenu').style.display = 'block';
      document.getElementById('authModalTabs').style.display = 'none';
      document.getElementById('authModalTitle').textContent = 'Account';
      document.getElementById('authModalSubtitle').textContent = '';
      const name = auth.user.displayName || auth.user.username;
      document.getElementById('profileAvatar').textContent = getInitial(name);
      document.getElementById('profileName').textContent = name;
      document.getElementById('profileTag').textContent = '@' + auth.user.username;
    } else {
      document.getElementById('loginForm').style.display = 'block';
      document.getElementById('registerForm').style.display = 'none';
      document.getElementById('userMenu').style.display = 'none';
      document.getElementById('authModalTabs').style.display = 'flex';
      document.getElementById('authModalTitle').textContent = 'Welcome back!';
      document.getElementById('authModalSubtitle').textContent = 'Log in to continue to Zellous';
      document.getElementById('loginTab').classList.add('active');
      document.getElementById('registerTab').classList.remove('active');
    }
  },

  hideAuthModal() {
    ui.authModal?.classList.remove('open');
  },

  async login(username, password) {
    try {
      ui.authError.style.display = 'none';
      await auth.login(username, password);
      ui.actions.hideAuthModal();
      ui.render.authStatus();
    } catch (e) {
      ui.authError.textContent = e.message;
      ui.authError.style.display = 'block';
    }
  },

  async register(username, password, displayName) {
    try {
      ui.authError.style.display = 'none';
      await auth.register(username, password, displayName);
      await auth.login(username, password);
      ui.actions.hideAuthModal();
      ui.render.authStatus();
    } catch (e) {
      ui.authError.textContent = e.message;
      ui.authError.style.display = 'block';
    }
  },

  async logout() {
    await auth.logout();
    ui.actions.hideAuthModal();
    ui.render.authStatus();
  },

  sendChat() {
    const content = ui.chatInput?.value?.trim();
    if (content) {
      chat.send(content);
      ui.chatInput.value = '';
    }
  },

  uploadFile() {
    ui.fileInput?.click();
  },

  handleFileSelect(e) {
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

  toggleMembers() {
    const ml = document.getElementById('memberList');
    ml.classList.toggle('open');
  },

  toggleQueue() {
    const qs = document.getElementById('queueSidebar');
    qs.classList.toggle('open');
  },

  toggleSettings() {
    ui.settingsPopover.classList.toggle('open');
  },

  openMobileMenu() {
    ui.channelSidebar.classList.add('open');
    ui.drawerOverlay.classList.add('open');
  },

  closeMobileMenu() {
    ui.channelSidebar.classList.remove('open');
    ui.drawerOverlay.classList.remove('open');
    document.getElementById('memberList').classList.remove('open');
    document.getElementById('queueSidebar')?.classList.remove('open');
  }
};

window.ui = ui;
