const network = {
  connect: () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = auth?.getToken();
    const url = token
      ? `${protocol}//${window.location.host}?token=${encodeURIComponent(token)}`
      : `${protocol}//${window.location.host}`;

    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    state.ws = ws;
    ws.onopen = () => {
      state.connectionStatus = 'Connected';
      state.isConnected = true;
      network.send({ type: 'join_room', roomId: state.roomId });
    };
    ws.onmessage = (e) => message.handle(msgpackr.unpack(new Uint8Array(e.data)));
    ws.onerror = () => {
      state.connectionStatus = 'Error';
      state.isConnected = false;
    };
    ws.onclose = () => {
      state.connectionStatus = 'Disconnected';
      state.isConnected = false;
      setTimeout(network.connect, 3000);
    };
  },
  reconnect: () => {
    if (state.ws) {
      state.ws.onclose = null; // Prevent auto-reconnect
      state.ws.close();
    }
    network.connect();
  },
  send: (msg) => {
    if (state.ws?.readyState === WebSocket.OPEN) {
      msg.roomId = state.roomId;
      state.ws.send(msgpackr.pack(msg));
    }
  },
  // Route audio messages through LiveKit data channel when available, WS as fallback.
  // Always also sends to WS for server-side recording unless DC-only mode.
  sendAudio: (msg) => {
    if (window.lk?.isDataChannelReady()) {
      if (msg.type === 'audio_chunk') {
        lk.sendData('audio_chunk', new Uint8Array(msg.data), true);
      } else {
        lk.sendData(msg.type, JSON.stringify({ type: msg.type }), true);
      }
      // Still send to WS for server persistence/recording
      network.send(msg);
      return;
    }
    network.send(msg);
  }
};

const message = {
  handlers: {
    // Connection & auth
    connection_established: (m) => {
      state.userId = m.clientId;
      if (m.user) {
        state.isAuthenticated = true;
        state.currentUser = m.user;
        auth.user = m.user;
      }
    },
    auth_success: (m) => {
      state.isAuthenticated = true;
      state.currentUser = m.user;
      ui.render.authStatus?.();
    },
    auth_failed: (m) => {
      console.warn('Auth failed:', m.error);
      state.isAuthenticated = false;
      state.currentUser = null;
    },

    // Room
    room_joined: (m) => {
      message.add(`Joined room: ${m.roomId}`);
      const members = m.currentUsers.map(u => ({ id: u.id, username: u.username, online: true, isBot: u.isBot, isAuthenticated: u.isAuthenticated }));
      const selfName = state.currentUser?.displayName || state.currentUser?.username || 'You';
      members.unshift({ id: state.userId, username: selfName, online: true, isAuthenticated: state.isAuthenticated });
      state.roomMembers = members;
      if (m.channels?.length) {
        state.channels = m.channels;
        const cur = state.currentChannel;
        if (!m.channels.find(c => c.id === cur?.id)) {
          state.currentChannel = m.channels[0] || { id: 'general', type: 'text', name: 'general' };
        }
      }
      m.currentUsers.forEach(u => message.add(`${u.username} is online`, null, u.id, u.username));
      ui.render.channels?.();
      ui.render.channelView?.();
      ui.render.members?.();
    },
    user_joined: (m) => {
      message.add(`${m.user} joined`, null, m.userId, m.user);
      const members = [...state.roomMembers];
      if (!members.find(x => x.id === m.userId)) {
        members.push({ id: m.userId, username: m.user, online: true, isBot: m.isBot, isAuthenticated: m.isAuthenticated });
        state.roomMembers = members;
      }
      ui.render.members?.();
    },
    user_left: (m) => {
      message.add('User left', null, m.userId);
      state.roomMembers = state.roomMembers.filter(x => x.id !== m.userId);
      ui.render.members?.();
      const speakers = new Set(state.activeSpeakers);
      speakers.delete(m.userId);
      state.activeSpeakers = speakers;
      if (state.currentLiveSpeaker === m.userId) state.currentLiveSpeaker = null;
      if (state.activeSegments.has(m.userId)) queue.completeSegment(m.userId);
      if (!state.currentSegmentId && !state.replayingSegmentId) queue.playNext();
    },
    user_updated: (m) => {},

    channel_created: (m) => {
      const channels = [...state.channels, m.channel];
      state.channels = channels;
      ui.render.channels?.();
    },
    channel_updated: (m) => {
      const channels = state.channels.map(c => c.id === m.channel.id ? { ...c, ...m.channel } : c);
      state.channels = channels;
      if (state.currentChannel?.id === m.channel.id) {
        state.currentChannel = channels.find(c => c.id === m.channel.id);
        ui.render.channelView?.();
      }
      ui.render.channels?.();
    },
    channel_deleted: (m) => {
      const channels = state.channels.filter(c => c.id !== m.channelId);
      state.channels = channels;
      if (state.currentChannel?.id === m.channelId && channels.length > 0) {
        state.currentChannel = channels[0];
        ui.render.channelView?.();
      }
      ui.render.channels?.();
    },

    // Audio
    speaker_joined: (m) => {
      const speakers = new Set(state.activeSpeakers);
      speakers.add(m.userId);
      state.activeSpeakers = speakers;
      if (m.userId !== state.userId) queue.addSegment(m.userId, m.user);
      const recAudio = new Map(state.recordingAudio);
      recAudio.set(m.userId, []);
      state.recordingAudio = recAudio;
      message.add(`${m.user} started talking`, null, m.userId, m.user);
      ui.render.speakers();
      ui.render.queue();
    },
    speaker_left: (m) => {
      const speakers = new Set(state.activeSpeakers);
      speakers.delete(m.userId);
      state.activeSpeakers = speakers;
      webcam.hidePlayback();
      if (m.userId !== state.userId) queue.completeSegment(m.userId);
      const recAudio = new Map(state.recordingAudio);
      message.add(`${m.user} stopped talking`, recAudio.get(m.userId), m.userId, m.user);
      recAudio.delete(m.userId);
      state.recordingAudio = recAudio;
      if (state.currentLiveSpeaker === m.userId) state.currentLiveSpeaker = null;
      const ended = new Set(state.recentlyEndedSpeakers);
      ended.add(m.userId);
      state.recentlyEndedSpeakers = ended;
      setTimeout(() => {
        const updated = new Set(state.recentlyEndedSpeakers);
        updated.delete(m.userId);
        state.recentlyEndedSpeakers = updated;
      }, 5000);
      if (state.activeSpeakers.size === 0) {
        state.skipLiveAudio = false;
        state.currentLiveSpeaker = null;
      }
      if ((!state.currentLiveSpeaker || state.activeSpeakers.size === 0) && !state.currentSegmentId && !state.replayingSegmentId && !state.isDeafened && !state.isSpeaking) {
        queue.playNext();
      }
      ui.render.speakers();
      ui.render.queue();
    },
    audio_data: (m) => {
      if (state.recentlyEndedSpeakers.has(m.userId)) return;
      if (!state.activeSegments.has(m.userId) && !state.activeSpeakers.has(m.userId)) {
        const speakers = new Set(state.activeSpeakers);
        speakers.add(m.userId);
        state.activeSpeakers = speakers;
        queue.addSegment(m.userId, `User${m.userId}`);
        const recAudio = new Map(state.recordingAudio);
        recAudio.set(m.userId, []);
        state.recordingAudio = recAudio;
        ui.render.speakers();
      }
      queue.addChunk(m.userId, m.data);
      const recAudio = state.recordingAudio;
      if (recAudio.has(m.userId)) {
        const chunks = recAudio.get(m.userId);
        chunks.push(new Uint8Array(m.data));
      }
      if (!state.isDeafened && !state.isSpeaking && !state.skipLiveAudio) {
        if (!state.currentLiveSpeaker) state.currentLiveSpeaker = m.userId;
        if (state.currentLiveSpeaker === m.userId) {
          audio.handleChunk(m.userId, m.data);
          const s = state.activeSegments.get(m.userId);
          if (s) s.playedRealtime = true;
        }
      }
    },

    // Video
    video_chunk: (m) => {
      const s = state.activeSegments.get(m.userId);
      if (s) {
        if (!s.videoChunks) s.videoChunks = [];
        s.videoChunks.push(m.data);
      }
      if (!state.isDeafened && !state.isSpeaking && !state.skipLiveAudio && state.currentLiveSpeaker === m.userId) {
        let incoming = state.incomingVideoChunks;
        if (!incoming) {
          incoming = new Map();
          state.incomingVideoChunks = incoming;
        }
        if (!incoming.has(m.userId)) incoming.set(m.userId, []);
        incoming.get(m.userId).push(m.data);
        webcam.streamChunk(m.userId, m.data, s?.username || `User${m.userId}`);
      }
    },

    // Text messaging
    text_message: (m) => {
      chat.handleTextMessage(m);
    },
    image_message: (m) => {
      chat.handleImageMessage(m);
    },
    message_history: (m) => {
      chat.handleHistory(m.messages);
    },

    // Files
    file_shared: (m) => {
      chat.handleFileShared(m);
    },
    file_upload_started: (m) => {
      // Show upload progress notification
      message.add(`${m.username} is uploading ${m.filename}...`, null, m.userId, m.username);
    },
    file_list: (m) => {
      state.fileList = m.files;
      state.currentFilePath = m.path;
      ui.render.files?.();
    },

    message_deleted: (m) => {
      const msgs = (state.chatMessages || []).filter(msg => msg.id !== m.messageId);
      state.chatMessages = msgs;
      ui.render.chat?.();
    },
    user_kicked: (m) => {
      if (m.userId === state.userId) {
        message.add('You were kicked from this server');
        if (window.serverManager) serverManager.switchTo(null);
      } else {
        message.add(`User was kicked`);
      }
    },
    user_banned: (m) => {
      if (m.userId === state.userId) {
        message.add('You were banned from this server');
        if (window.serverManager) serverManager.switchTo(null);
      } else {
        message.add(`User was banned`);
      }
    }
  },

  handle: (m) => {
    const h = message.handlers[m.type];
    if (h) h(m);
  },

  add: (text, audioData = null, userId = null, username = null) => {
    const id = Date.now() + Math.random();
    const m = { id, text, time: new Date().toLocaleTimeString(), userId, username };
    if (audioData?.length) {
      m.hasAudio = true;
      const history = new Map(state.audioHistory);
      history.set(id, audioData);
      state.audioHistory = history;
    }
    const messages = [...state.messages, m];
    if (messages.length > 50) {
      const r = messages.shift();
      if (r.hasAudio) {
        const history = new Map(state.audioHistory);
        history.delete(r.id);
        state.audioHistory = history;
      }
    }
    state.messages = messages;
    ui.render.messages();
  }
};

window.network = network;
window.message = message;
