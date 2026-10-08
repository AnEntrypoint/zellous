export function installChat(ww) {
  const a = ww.auth;
  // Message bus bridge
  const msg = ww.message;
  window.message = {
    handlers: msg.handlers,
    handle: (m) => msg.handle(m),
    add: (text, audioData, userId, username) => {
      const r = msg.add(text, { audioData, userId, username });
      state.messages = msg.messages;
      if (window.ui) ui.render.messages?.();
      return r;
    }
  };
  msg.addEventListener('messages', (e) => { state.messages = e.detail.list; if (window.ui) ui.render.messages?.(); });

  // Chat bridge
  const chat = ww.chat;
  let _lastChatMsgCount = 0;
  const CHAT_MESSAGES_CAP = 500;
  chat.addEventListener('messages', (e) => {
    const list = e.detail.list || [];
    if (typeof document !== 'undefined' && document.hidden && list.length > _lastChatMsgCount) {
      state.unreadCount = (state.unreadCount || 0) + (list.length - _lastChatMsgCount);
    }
    _lastChatMsgCount = list.length;
    state.chatMessages = list.length > CHAT_MESSAGES_CAP ? list.slice(list.length - CHAT_MESSAGES_CAP) : list;
    _updateChatMembers(list); if (window.ui) ui.render.all();
  });
  const chatMembersIntervalId = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    _updateChatMembers(state.chatMessages || []); if (window.ui) ui.render.all();
  }, 60000);
  chat.addEventListener('profile', () => { state.profilesVersion = (state.profilesVersion || 0) + 1; });
  chat.addEventListener('rate-limited', (e) => {
    const secs = Math.ceil((e.detail?.retryAfterMs || 0) / 1000);
    if (window.ui?.showToast) ui.showToast(`Sending too fast — try again in ${secs}s`, 2500, 'error');
  });
  chat.addEventListener('send-blocked', (e) => {
    const msg = e.detail?.reason === 'announcement-admin-only'
      ? 'Only admins can post in announcement channels'
      : 'You cannot send messages in this server';
    if (window.ui?.showToast) ui.showToast(msg, 3000, 'error');
  });
  const ONLINE_WINDOW_MS = 5 * 60 * 1000;
  function _updateChatMembers(msgs) {
    const lastSeen = new Map();
    (msgs || []).forEach(m => {
      if (!m.userId) return;
      const ts = m.timestamp || 0;
      if (!lastSeen.has(m.userId) || ts > lastSeen.get(m.userId)) lastSeen.set(m.userId, ts);
    });
    const now = Date.now();
    if (a.pubkey) lastSeen.set(a.pubkey, now);
    state.roomMembers = Array.from(lastSeen.entries()).map(([id, ts]) => ({
      id, username: chat.resolveProfile(id), online: (now - ts) <= ONLINE_WINDOW_MS
    }));
  }
  window.chat = {
    // Delegates to the library Chat instance's own field rather than tracking
    // a separate copy -- loadHistory() can be triggered either through this
    // bridge's wrapper below or directly by wireweave.js's onSwitch callback
    // (e.g. the first-run auto-join path), and both must be reflected here.
    get activeChannelId() { return chat.activeChannelId; },
    get messages() { return state.chatMessages || []; },
    set messages(v) { state.chatMessages = v; },
    send: (c, opts) => chat.send(c, opts),
    sendAnnouncement: (t) => chat.send(t, { announcement: true }),
    sendImage(file) {
      return window.nostrMedia.sendMedia(file).catch((e) => { window.ui?.showToast?.('Upload failed: ' + (e && e.message || 'unknown error'), 4000, 'error'); });
    },
    async loadHistory(channelId) { await ww.setCurrentChannel(channelId); },
    deleteMessage: (id) => chat.deleteMessage(id),
    editMessage() { if (window.ui?.showToast) ui.showToast('Nostr messages cannot be edited'); },
    resolveProfile: (pk) => chat.resolveProfile(pk),
    updateProfile: (pk, p) => chat.updateProfile(pk, p),
    handleTextMessage(m) { chat._addMessage(m); },
    handleImageMessage() {}, handleFileShared() {}
  };

  // Reactions bridge — NIP-25 kind:7 on native kind:42 chat messages. Auto-
  // subscribes for every message currently in view (mirrors the profile
  // auto-fetch pattern above) so reaction counts populate without an
  // explicit per-message opt-in from the UI layer.
  const reactions = ww.reactions;
  // ui.render.all() targets removed legacy DOM -- the SDK's mountCommunityApp
  // re-renders only from the adapter's preact-signal subscription (SIGNALS
  // list in nostr-adapter.js), which never included a reactions dependency,
  // so a reaction arriving from a relay never triggered a re-render until some
  // unrelated signal happened to change. reactionsVersion is that dependency.
  reactions.addEventListener('updated', () => {
    if (window.ui) ui.render.all();
    state.reactionsVersion = (state.reactionsVersion || 0) + 1;
  });
  chat.addEventListener('messages', (e) => {
    const ids = (e.detail.list || []).map((m) => m.id).filter(Boolean);
    if (ids.length) reactions.subscribeMany(ids);
  });
  window.nostrReactions = {
    getFor: (id) => reactions.getFor(id),
    react: (id, authorPubkey, content) => reactions.react(id, authorPubkey, content),
    unreact: (id) => reactions.unreact(id)
  };
}
