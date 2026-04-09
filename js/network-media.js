Object.assign(message.handlers, {
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

    text_message: (m) => {
      chat.handleTextMessage(m);
    },
    image_message: (m) => {
      chat.handleImageMessage(m);
    },
    message_history: (m) => {
      chat.handleHistory(m.messages, m.channelId);
    },

    file_shared: (m) => {
      chat.handleFileShared(m);
    },
    file_upload_started: (m) => {
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
    message_updated: (m) => {
      const msgs = state.chatMessages || [];
      const idx = msgs.findIndex(msg => msg.id === m.messageId);
      if (idx !== -1) {
        msgs[idx] = { ...msgs[idx], content: m.content, edited: m.edited, editedAt: m.editedAt };
        state.chatMessages = [...msgs];
        ui.render.chat?.();
      }
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
});
