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
    const template = {
      kind: 42,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['e', state.currentChannelId, 'wss://relay.damus.io', 'root']],
      content: trimmed,
    };
    const signedEvent = await auth.sign(template);
    nostrNet.publish(signedEvent);
    chat._addMessage(chat._eventToMsg(signedEvent));
  },

  sendImage() {
    if (typeof ui !== 'undefined' && ui.showToast) ui.showToast('Image upload coming soon');
    else console.warn('Image upload coming soon');
  },

  async loadHistory(channelId) {
    if (chat.activeChannelId) nostrNet.unsubscribe('chat-' + chat.activeChannelId);
    chat.activeChannelId = channelId;
    state.chatMessages = [];
    const collected = [];
    nostrNet.subscribe(
      'chat-' + channelId,
      [{ kinds: [42], '#e': [channelId], limit: 50 }],
      function(event) { collected.push(chat._eventToMsg(event)); },
      function() {
        collected.sort(function(a, b) { return a.timestamp - b.timestamp; });
        state.chatMessages = collected;
        ui.render.all();
      }
    );
    nostrNet.subscribe(
      'chat-live-' + channelId,
      [{ kinds: [42], '#e': [channelId], since: Math.floor(Date.now() / 1000) }],
      function(event) { chat._addMessage(chat._eventToMsg(event)); },
      function() {}
    );
  },

  _eventToMsg(event) {
    return {
      id: event.id,
      type: 'text',
      userId: event.pubkey,
      username: chat.resolveProfile(event.pubkey),
      content: event.content,
      timestamp: event.created_at * 1000,
    };
  },

  _addMessage(msg) {
    if (state.chatMessages && state.chatMessages.find(function(m) { return m.id === msg.id; })) return;
    const current = state.chatMessages ? state.chatMessages.slice() : [];
    current.push(msg);
    state.chatMessages = current;
    ui.render.all();
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
        ui.render.all();
      }
    );
  },

  handleTextMessage(msg) { chat._addMessage(msg); },
  handleImageMessage() {},
  handleFileShared() {},
};

window.chat = chat;
