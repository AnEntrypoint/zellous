Object.assign(message.handlers, {
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

    room_joined: (m) => {
      if (m.roomId !== network._pendingRoomId) return;
      network._pendingRoomId = null;
      state.roomId = m.roomId;
      state.messages = [];
      state.chatMessages = [];
      const srv = (state.servers || []).find(s => s.id === m.roomId);
      const roomLabel = srv ? srv.name : m.roomId;
      const members = m.currentUsers.map(u => ({ id: u.id, username: u.username, online: true, isBot: u.isBot, isAuthenticated: u.isAuthenticated }));
      const selfName = state.currentUser?.displayName || state.currentUser?.username || 'You';
      members.unshift({ id: state.userId, username: selfName, online: true, isAuthenticated: state.isAuthenticated });
      state.roomMembers = members;
      const channels = m.channels || [];
      const categories = m.categories || [];
      state.channels = channels;
      state.categories = categories;
      const cur = state.currentChannel;
      const match = channels.find(c => c.id === cur?.id);
      state.currentChannel = match || channels[0] || { id: 'general', type: 'text', name: 'general' };
      ui.render.channels?.();
      ui.render.channelView?.();
      ui.render.members?.();
      const ch = state.currentChannel;
      if (ch?.type === 'text' || ch?.type === 'announcement') {
        network.send({ type: 'get_messages', limit: 50, channelId: ch.id });
      }
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
    channels_reordered: (m) => {
      state.channels = m.channels;
      ui.render.channels?.();
    },

    category_created: (m) => {
      const categories = [...state.categories, m.category];
      state.categories = categories;
      ui.render.channels?.();
    },
    category_updated: (m) => {
      const categories = state.categories.map(c => c.id === m.category.id ? { ...c, ...m.category } : c);
      state.categories = categories;
      ui.render.channels?.();
    },
    category_deleted: (m) => {
      const categories = state.categories.filter(c => c.id !== m.categoryId);
      state.categories = categories;
      state.channels = state.channels.map(ch => 
        ch.categoryId === m.categoryId ? { ...ch, categoryId: null } : ch
      );
      ui.render.channels?.();
    },
    categories_reordered: (m) => {
      state.categories = m.categories;
      ui.render.channels?.();
    },

});
