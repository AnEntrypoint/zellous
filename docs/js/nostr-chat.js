const profiles = new Map();
const fetching = new Set();

const chat = {
  activeChannelId: null,

  get messages() { return state.chatMessages || []; },
  set messages(v) { state.chatMessages = v; },

  async send(content) {
    if (!auth.isLoggedIn() || !state.currentChannelId) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    const chanHex = await _hexChannelId(state.currentChannelId, state.currentServerId);
    const relayHint = (state.nostrRelays || [])[0] || '';
    const template = {
      kind: 42,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['e', chanHex, relayHint, 'root']],
      content: trimmed,
    };
    const signedEvent = await auth.sign(template);
    nostrNet.publish(signedEvent);
    chat._addMessage(chat._eventToMsg(signedEvent));
  },

  sendImage(file) {
    if (!file) {
      var input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*,video/*';
      input.onchange = function() { if (input.files[0]) nostrMedia.sendMedia(input.files[0]).catch(function(e){ message.add('Upload failed: ' + e.message); }); };
      input.click(); return;
    }
    nostrMedia.sendMedia(file).catch(function(e){ message.add('Upload failed: ' + e.message); });
  },

  async loadHistory(channelId) {
    if (chat.activeChannelId) {
      nostrNet.unsubscribe('chat-' + chat.activeChannelId);
      nostrNet.unsubscribe('chat-live-' + chat.activeChannelId);
    }
    chat.activeChannelId = channelId;
    state.chatMessages = [];
    const chanHex = await _hexChannelId(channelId, state.currentServerId);
    const collected = [];
    nostrNet.subscribe(
      'chat-' + channelId,
      [{ kinds: [42], '#e': [chanHex], limit: 50 }],
      function(event) { collected.push(chat._eventToMsg(event)); },
      function() {
        collected.sort(function(a, b) { return a.timestamp - b.timestamp; });
        state.chatMessages = collected;
        chat._updateMembers(collected);
        ui.render.all();
      }
    );
    nostrNet.subscribe(
      'chat-live-' + channelId,
      [{ kinds: [42], '#e': [chanHex], since: Math.floor(Date.now() / 1000) }],
      function(event) { chat._addMessage(chat._eventToMsg(event)); },
      function() {}
    );
  },

  async sendAnnouncement(text) {
    if (!auth.isLoggedIn() || !state.currentChannelId) return;
    if (!window.serverRoles || !serverRoles.isAdmin(state.currentServerId)) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const chanHex = await _hexChannelId(state.currentChannelId, state.currentServerId);
    const relayHint = (state.nostrRelays || [])[0] || '';
    const template = {
      kind: 42,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['e', chanHex, relayHint, 'root'], ['t', 'announcement']],
      content: trimmed,
    };
    const signedEvent = await auth.sign(template);
    nostrNet.publish(signedEvent);
    chat._addMessage(chat._eventToMsg(signedEvent));
  },

  _eventToMsg(event) {
    const tTags = (event.tags || []).filter(t => t[0] === 't').map(t => t[1]);
    chat._fetchProfile(event.pubkey);
    return {
      id: event.id,
      type: 'text',
      userId: event.pubkey,
      content: event.content,
      timestamp: event.created_at * 1000,
      tags: tTags,
    };
  },

  _addMessage(msg) {
    if (state.chatMessages && state.chatMessages.find(function(m) { return m.id === msg.id; })) return;
    const current = state.chatMessages ? state.chatMessages.slice() : [];
    current.push(msg);
    state.chatMessages = current;
    chat._updateMembers(current);
    ui.render.all();
  },

  _updateMembers(msgs) {
    const seen = new Map();
    (msgs || []).forEach(function(m) {
      if (m.userId && !seen.has(m.userId)) seen.set(m.userId, chat.resolveProfile(m.userId));
    });
    state.roomMembers = Array.from(seen.entries()).map(function([id, username]) {
      return { id, username, online: true };
    });
  },

  async deleteMessage(id) {
    const template = {
      kind: 5,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['e', id]],
      content: 'deleted',
    };
    const signedEvent = await auth.sign(template);
    nostrNet.publish(signedEvent);
    state.chatMessages = (state.chatMessages || []).filter(function(m) { return m.id !== id; });
    ui.render.all();
  },

  editMessage() {
    if (typeof ui !== 'undefined' && ui.showToast) ui.showToast('Nostr messages cannot be edited');
    else console.warn('Nostr messages cannot be edited');
  },

  resolveProfile(pubkey) {
    if (profiles.has(pubkey)) {
      const p = profiles.get(pubkey);
      return p.name || auth.npubShort(pubkey);
    }
    chat._fetchProfile(pubkey);
    return auth.npubShort(pubkey);
  },

  _fetchProfile(pubkey) {
    if (fetching.has(pubkey)) return;
    fetching.add(pubkey);
    nostrNet.subscribe(
      'profile-' + pubkey,
      [{ kinds: [0], authors: [pubkey], limit: 1 }],
      function(event) {
        try {
          const p = JSON.parse(event.content);
          profiles.set(pubkey, p);
          if (pubkey === state.nostrPubkey) state.nostrProfile = p;
        } catch (e) {}
      },
      function() {
        nostrNet.unsubscribe('profile-' + pubkey);
        fetching.delete(pubkey);
        chat._updateMembers(state.chatMessages);
        ui.render.all();
      }
    );
  },

  linkify(html) {
    return html.replace(/https?:\/\/[^\s<>"]+/g, function(url) {
      if (!window.nostrMedia) return '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>';
      var kind = nostrMedia.isMedia(url);
      if (kind === 'image') return '<a href="' + url + '" target="_blank" rel="noopener"><img src="' + url + '" style="max-width:100%;max-height:300px;border-radius:8px;margin-top:4px;display:block" loading="lazy"></a>';
      if (kind === 'video') return '<video src="' + url + '" controls style="max-width:100%;max-height:300px;border-radius:8px;margin-top:4px;display:block"></video>';
      return '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>';
    });
  },

  handleTextMessage(msg) { chat._addMessage(msg); },
  handleImageMessage() {},
  handleFileShared() {},

  updateProfile(pubkey, profile) {
    profiles.set(pubkey, profile);
    ui.render.all();
  },
};

window.__zellous.chat = chat;
window.chat = chat;
