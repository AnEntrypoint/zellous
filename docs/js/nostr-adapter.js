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

    const persistBool = (signalName, key, val) => {
      if (S[signalName]) S[signalName].value = !!val;
      try { localStorage.setItem(key, val ? '1' : '0'); } catch (_) {}
    };
    // The SDK bundle owns its own theme system (its own localStorage key
    // '247420:theme', vocabulary auto/paper/ink/thebird) and self-applies it
    // via a microtask right after the module evaluates — before this init()
    // runs. Route through sdk.applyTheme so we win the last write instead of
    // fighting it with a second, incompatible attribute value.
    const applyTheme = (next) => {
      const theme = next === 'light' ? 'light' : 'ink';
      if (S.themePref) S.themePref.value = theme;
      if (sdk.applyTheme) sdk.applyTheme(theme === 'light' ? 'paper' : 'ink');
      else document.documentElement.setAttribute('data-theme', theme);
      try { localStorage.setItem('zellous-theme', theme); } catch (_) {}
    };
    // Re-apply zellous's persisted preference now that the SDK's own boot-time
    // self-init (which may have picked its own default) has already run.
    applyTheme(v('themePref', 'ink'));

    // Snapshot read across the live signals. effect() (below) tracks whichever
    // .value reads happen during render, so any change re-renders.
    const pageChannels = () => {
      const sid = v('currentServerId', null);
      if (!window.serverPages || !sid) return [];
      return (window.serverPages.getPages(sid) || []).map(p => ({
        id: 'page:' + p.slug, name: p.title || p.slug, type: 'page',
        _serverId: sid, _slug: p.slug, updatedAt: p.updatedAt,
      }));
    };

    const get = () => {
      const curr = v('currentChannel', null);
      const sid = v('currentServerId', null);
      const isPage = curr && curr.type === 'page';
      const pageData = isPage && window.serverPages
        ? (window.serverPages.getPages(curr._serverId || sid) || []).find(p => p.slug === curr._slug)
        : null;
      const canManage = !!(window.serverRoles && sid && window.serverRoles.isAdmin(sid));
      return {
      channels: [...v('channels', []), ...pageChannels()],
      categories: v('categories', []),
      servers: v('servers', []),
      currentChannel: curr,
      currentServerId: sid,
      pageHtml: pageData ? pageData.html : '',
      canManage,
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
      authMode: v('authMode', 'extension'),
      authError: v('authError', ''),
      authBusy: v('authBusy', false),
      settingsOpen: v('settingsOpen', false),
      settingsAnchor: v('settingsAnchor', { x: 0, y: 0 }),
      settingsSections: [{
        title: 'Preferences',
        rows: [
          { label: 'Theme', kind: 'select', value: v('themePref', 'ink'), options: [{ value: 'ink', label: 'Dark' }, { value: 'light', label: 'Light' }], onChange: applyTheme },
          { label: 'Notifications', kind: 'toggle', value: v('notificationsEnabled', true), onChange: (val) => persistBool('notificationsEnabled', 'zellous-notifications', val) },
          { label: 'Message preview', kind: 'toggle', value: v('messagePreviewEnabled', true), onChange: (val) => persistBool('messagePreviewEnabled', 'zellous-message-preview', val) },
          { label: 'Sound', kind: 'toggle', value: v('soundEnabled', true), onChange: (val) => persistBool('soundEnabled', 'zellous-sound', val) },
        ],
      }, {
        title: 'Account',
        rows: [
          { label: (window.auth && window.auth.isLoggedIn && window.auth.isLoggedIn()) ? ('Signed in as ' + (window.auth.npubShort ? window.auth.npubShort() : '')) : 'Not signed in', kind: 'value', value: '' },
          { label: 'Switch or import identity', kind: 'button', onClick: () => { if (S.authMode) S.authMode.value = 'import'; if (S.authError) S.authError.value = ''; if (S.settingsOpen) S.settingsOpen.value = false; if (S.showAuthModal) S.showAuthModal.value = true; } },
        ],
      }],
      voiceSettingsOpen: v('voiceSettingsOpen', false),
      replyTarget: v('replyTarget', null),
      threadPanelOpen: v('threadPanelOpen', false),
      activeThreadId: v('activeThreadId', null),
      threads: v('threads', []),
      forumPosts: [],
      };
    };

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
      openThread: (id) => call(() => window.threadManager && window.threadManager.select(id)),
      selectThread: (id) => call(() => window.threadManager && window.threadManager.select(id)),
      createThread: () => call(() => {
        const parentId = v('currentChannel', null)?.id;
        return window.threadManager && window.threadManager.create(parentId);
      }),
      closeThreadPanel: () => call(() => window.threadManager && window.threadManager.closePanel()),
      newForumPost: () => call(() => window.ui && window.ui.showToast && window.ui.showToast('Forum posts are not yet supported', 3000, 'error')),
      setAuthMode: (m) => call(() => { if (S.authMode) S.authMode.value = m; if (S.authError) S.authError.value = ''; }),
      closeAuth: () => call(() => { if (S.showAuthModal) S.showAuthModal.value = false; if (S.authError) S.authError.value = ''; if (S.authBusy) S.authBusy.value = false; }),
      authExtension: () => call(async () => {
        if (!window.auth) return;
        if (S.authBusy) S.authBusy.value = true;
        try {
          if (!window.nostr) throw new Error('No Nostr extension found');
          await window.auth.loginWithExtension();
          if (S.showAuthModal) S.showAuthModal.value = false;
          if (S.authError) S.authError.value = '';
        } catch (e) {
          if (S.authError) S.authError.value = (e && e.message) || 'Extension login failed';
        } finally {
          if (S.authBusy) S.authBusy.value = false;
        }
      }),
      authGenerate: () => call(() => {
        if (!window.auth) return;
        try {
          window.auth.generateKey();
          if (S.showAuthModal) S.showAuthModal.value = false;
          if (S.authError) S.authError.value = '';
          window.ui && window.ui.showToast && window.ui.showToast('New identity created — back it up before clearing browser storage.', 5000);
        } catch (e) {
          if (S.authError) S.authError.value = (e && e.message) || 'Failed to generate key';
        }
      }),
      authImport: (key) => call(() => {
        if (!window.auth) return;
        const k = (key || '').trim();
        if (!k) { if (S.authError) S.authError.value = 'Enter a key'; return; }
        const ok = window.auth.importKey(k);
        if (ok) {
          if (S.showAuthModal) S.showAuthModal.value = false;
          if (S.authError) S.authError.value = '';
        } else if (S.authError) {
          S.authError.value = 'Invalid key — expected nsec1… or a 64-character hex secret key';
        }
      }),
      editPage: () => call(() => {
        const ch = v('currentChannel', null);
        if (!ch || ch.type !== 'page' || !window.serverPages) return;
        const existing = (window.serverPages.getPages(ch._serverId) || []).find(p => p.slug === ch._slug);
        const html = window.prompt('Edit page HTML', existing ? existing.html : '');
        if (html === null) return;
        window.serverPages.publish(ch._serverId, ch._slug, ch.name, html)
          .catch((e) => window.ui && window.ui.showToast && window.ui.showToast('Failed to save page: ' + (e && e.message || 'unknown'), 3000, 'error'));
      }),
    };

    const helpers = {
      avatarColor: (id) => (window.getAvatarColor && window.getAvatarColor(id)) || 'var(--accent)',
      initial: (n) => (window.getInitial ? window.getInitial(n) : String(n || '?').slice(0, 1).toUpperCase()),
      formatTime: (t) => (window.formatTime ? window.formatTime(t) : new Date(t || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })),
    };

    const SIGNALS = ['channels', 'categories', 'servers', 'currentChannel', 'currentServerId', 'chatMessages', 'messages', 'chatInputValue', 'currentUser', 'isConnected', 'voiceConnected', 'voiceChannelName', 'voiceConnectionState', 'voiceParticipants', 'micMuted', 'voiceDeafened', 'showAuthModal', 'authMode', 'authError', 'authBusy', 'settingsOpen', 'voiceSettingsOpen', 'replyTarget', 'threadPanelOpen', 'activeThreadId', 'threads', 'pagesVersion', 'themePref', 'notificationsEnabled', 'messagePreviewEnabled', 'soundEnabled'];
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
