import { playPing, shouldPing } from '../notify.js';

export function installChat(ww) {
  const a = ww.auth;
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

  const chat = ww.chat;
  let _lastChatMsgCount = 0;
  let _pingChannel = null;
  let _pingSince = 0;
  let _pinged = new Set();
  const CHAT_MESSAGES_CAP = 500;
  chat.addEventListener('messages', (e) => {
    const list = e.detail.list || [];
    if (typeof document !== 'undefined' && document.hidden && list.length > _lastChatMsgCount) {
      state.unreadCount = (state.unreadCount || 0) + (list.length - _lastChatMsgCount);
    }
    _lastChatMsgCount = list.length;
    const channel = chat.activeChannelId;
    if (channel !== _pingChannel) {
      _pingChannel = channel;
      _pingSince = Math.floor(Date.now() / 1000) * 1000;
      _pinged = new Set(list.map((m) => m.id));
    } else {
      const me = state.nostrPubkey;
      for (const m of list) {
        if (_pinged.has(m.id)) continue;
        _pinged.add(m.id);
        if (m.timestamp < _pingSince) continue;
        if (shouldPing({
          text: m.content,
          fromSelf: m.userId === me,
          soundOn: state.soundEnabled && !(state.mutedChannels || []).includes(channel) && !(window.nostrPresence && window.nostrPresence.statusOf(me).status === 'dnd'),
          mentionsOnly: state.pref_mentionsonly,
          name: chat.resolveProfile(me),
          everyone: !!(window.nostrAccount && window.nostrAccount.everyonePings()),
          alerts: String(state.pref_kw || '').split(',').map((w) => w.trim()).filter((w) => w.length > 1)
        })) playPing();
      }
    }
    state.chatMessages = list.length > CHAT_MESSAGES_CAP ? list.slice(list.length - CHAT_MESSAGES_CAP) : list;
    _updateChatMembers(list); if (window.ui) ui.render.all();
  });
  const chatMembersIntervalId = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    _updateChatMembers(state.chatMessages || []); if (window.ui) ui.render.all();
  }, 60000);
  chat.addEventListener('typing', () => { state.typingVersion = (state.typingVersion || 0) + 1; });
  chat.addEventListener('profile', () => { state.profilesVersion = (state.profilesVersion || 0) + 1; _updateChatMembers(state.chatMessages || []); if (window.ui) ui.render.all(); });
  chat.addEventListener('rate-limited', (e) => {
    const secs = Math.ceil((e.detail?.retryAfterMs || 0) / 1000);
    if (window.ui?.showToast) ui.showToast(secs > 0 ? `Sending too fast — your message is queued and goes out in ${secs}s` : 'Sending too fast — your message is queued', 2500, 'info');
  });
  chat.addEventListener('channel', (e) => {
    const next = (state.channels || []).find((c) => c.id === e.detail.channelId);
    if (next && (!state.currentChannel || state.currentChannel.id !== next.id)) { state.currentChannel = next; state.currentChannelId = next.id; }
  });
  chat.addEventListener('send-blocked', (e) => {
    const msg = e.detail?.reason === 'announcement-admin-only'
      ? 'Only admins can post in announcement channels'
      : e.detail?.reason === 'server-deleted'
        ? 'This server was deleted by its owner, so nothing can be sent to it'
      : e.detail?.reason === 'no-server'
        ? 'Pick a server before sending a message'
      : e.detail?.reason === 'no-channel'
        ? 'Channels are still loading, try again in a moment'
        : e.detail?.reason === 'not-signed-in'
          ? 'Still signing in, try again in a moment'
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
    const members = Array.from(lastSeen.entries()).map(([id, ts]) => ({
      id, username: chat.resolveProfile(id), online: (now - ts) <= ONLINE_WINDOW_MS
    }));
    const prev = state.roomMembers || [];
    const sameMembers = prev.length === members.length && members.every((m, i) => prev[i].id === m.id && prev[i].username === m.username && prev[i].online === m.online);
    if (sameMembers) return;
    const sameIds = prev.length === members.length && members.every((m, i) => prev[i].id === m.id);
    state.roomMembers = members;
    if (!sameIds && window.nostrPresence) window.nostrPresence.subscribe(members.map((m) => m.id));
  }
  window.chat = {
    get activeChannelId() { return chat.activeChannelId; },
    get messages() { return state.chatMessages || []; },
    set messages(v) { state.chatMessages = v; },
    send: (c, opts) => chat.send(c, opts),
    hasChannel: () => chat.hasChannel(),
    retrySend: (id) => chat.retrySend(id),
    sendAnnouncement: (t) => chat.send(t, { announcement: true }),
    sendImage(file) {
      return window.nostrMedia.sendMedia(file).catch((e) => { window.ui?.showToast?.('Upload failed: ' + (e && e.message || 'unknown error'), 4000, 'error'); });
    },
    async loadHistory(channelId) { await ww.setCurrentChannel(channelId); },
    deleteMessage: (id) => chat.deleteMessage(id),
    editMessage() { if (window.ui?.showToast) ui.showToast('Nostr messages cannot be edited'); },
    resolveProfile: (pk) => chat.resolveProfile(pk),
    typingPubkeys: () => chat.typingPubkeys(),
    sendTyping: () => chat.sendTyping(),
    updateProfile: (pk, p) => chat.updateProfile(pk, p),
    handleTextMessage(m) { chat._addMessage(m); },
    handleImageMessage() {}, handleFileShared() {}
  };

  const reactions = ww.reactions;
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
