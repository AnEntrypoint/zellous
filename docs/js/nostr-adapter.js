// nostr-adapter — the thin consumer seam. Maps zellous's Nostr-backed state
// (window.stateSignals preact signals) + action modules to the design-system
// adapter contract, then hands the whole GUI to the SDK's mountCommunityApp.
// All composition/rendering lives in the SDK (window.__sdk.C.mountCommunityApp);
// zellous only supplies data + action callbacks here.
(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    const mount = sdk && sdk.C && sdk.C.mountCommunityApp;
    if (!sdk || !effect || !mount || !window.stateSignals) { setTimeout(init, 30); return; }

    const root = document.getElementById('app');
    if (!root) return;

    const S = window.stateSignals;
    const v = (name, fallback) => (S[name] && 'value' in S[name]) ? S[name].value : fallback;

    // Snapshot read across the live signals. effect() (below) tracks whichever
    // .value reads happen during render, so any change re-renders.
    const get = () => ({
      channels: v('channels', []),
      categories: v('categories', []),
      servers: v('servers', []),
      currentChannel: v('currentChannel', null),
      currentServerId: v('currentServerId', null),
      homeMode: (window.state && window.state.homeMode) || false,
      messages: (window.chat && window.chat.messages) || v('chatMessages', []),
      chatInputValue: v('chatInputValue', ''),
      currentUser: v('currentUser', null),
      userId: (window.state && (window.state.userId || window.state.nostrPubkey)) || null,
      isConnected: v('isConnected', true),
      voiceConnected: v('voiceConnected', false),
      voiceChannelName: v('voiceChannelName', ''),
      voiceConnectionState: v('voiceConnectionState', 'connected'),
      voiceParticipants: v('voiceParticipants', []),
      micMuted: v('micMuted', false),
      voiceDeafened: v('voiceDeafened', false),
      memberCategories: (window.uiMembers && window.uiMembers.categories && window.uiMembers.categories()) || [],
      memberListOpen: (window.state && window.state.memberListOpen) || false,
      showAuthModal: v('showAuthModal', false),
      settingsOpen: v('settingsOpen', false),
      voiceSettingsOpen: v('voiceSettingsOpen', false),
      replyTarget: v('replyTarget', null),
    });

    const call = (fn) => { try { return fn && fn(); } catch (_) {} };
    const actions = {
      switchChannel: (ch) => call(() => window.ui.actions.switchChannel(ch)),
      send: (text, opts) => call(() => window.chat.send(text, opts)),
      setInput: (val) => { if (S.chatInputValue) S.chatInputValue.value = val; else if (window.state) window.state.chatInputValue = val; },
      resolveProfile: (id) => (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(id)) || null,
      toggleMic: () => call(() => (window.lk && window.lk.toggleMic) ? window.lk.toggleMic() : (window.state.micMuted = !window.state.micMuted)),
      toggleDeafen: () => call(() => (window.lk && window.lk.toggleDeafen) ? window.lk.toggleDeafen() : (window.state.voiceDeafened = !window.state.voiceDeafened)),
      leaveVoice: () => call(() => (window.lk && window.lk.disconnect) ? window.lk.disconnect() : (window.voice && window.voice.leave && window.voice.leave())),
      returnToVoice: () => call(() => {
        const name = v('voiceChannelName', '');
        const ch = (window.state.channels || []).find(c => c.type === 'voice' && c.name === name);
        if (ch) window.ui.actions.switchChannel(ch);
      }),
      toggleMembers: () => call(() => window.ui.actions.toggleMembers()),
      openMobileMenu: () => call(() => window.ui.actions.openMobileMenu && window.ui.actions.openMobileMenu()),
      openSettings: () => call(() => window.ui.actions.toggleSettings && window.ui.actions.toggleSettings()),
      openVoiceSettings: () => call(() => window.openVoiceSettings && window.openVoiceSettings()),
      goHome: () => call(() => { window.state.homeMode = true; window.state.currentServerId = null; }),
      openServers: () => call(() => document.getElementById('zServersBtn') && document.getElementById('zServersBtn').click()),
      switchServer: (id) => call(() => { window.state.homeMode = false; window.serverManager.switchTo(id); }),
      channelContext: (id, x, y) => call(() => window.channelManager.showContextMenu(id, x, y)),
      serverContext: (id, x, y) => call(() => window.serverManager.showContextMenu(id, x, y)),
      memberMenu: (id, name, x, y) => call(() => window.moderation.showMemberMenu(id, name, x, y)),
      replaySegment: (id) => call(() => window.queue.replaySegment(id, true)),
      skipSegment: () => call(() => { window.queue.stopReplay(); window.queue.playNext(); }),
      pauseQueue: () => call(() => window.queue.pausePlayback()),
      resumeQueue: () => call(() => window.queue.resumePlayback()),
    };

    const helpers = {
      avatarColor: (id) => (window.getAvatarColor && window.getAvatarColor(id)) || 'var(--accent)',
      initial: (n) => (window.getInitial ? window.getInitial(n) : String(n || '?').slice(0, 1).toUpperCase()),
      formatTime: (t) => (window.formatTime ? window.formatTime(t) : new Date(t || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })),
    };

    const SIGNALS = ['channels', 'categories', 'servers', 'currentChannel', 'currentServerId', 'chatMessages', 'messages', 'chatInputValue', 'currentUser', 'isConnected', 'voiceConnected', 'voiceChannelName', 'voiceConnectionState', 'voiceParticipants', 'micMuted', 'voiceDeafened', 'showAuthModal', 'settingsOpen', 'voiceSettingsOpen', 'replyTarget'];
    const subscribe = (cb) => {
      // preact effect: reading each .value registers a dependency, so cb re-fires on any change
      return effect(() => { for (const n of SIGNALS) { if (S[n]) void S[n].value; } cb(); });
    };

    const adapter = { get, subscribe, actions, helpers };
    const app = mount(root, adapter);

    // Preserve the imperative overlay globals other zellous modules call.
    if (app && app.api) {
      window.__contextMenu = app.api.contextMenu;
      window.__emojiPicker = app.api.emojiPicker;
      window.__commandPalette = app.api.commandPalette;
    }
    window.__communityAppMounted = true;
  }
  init();
})();
