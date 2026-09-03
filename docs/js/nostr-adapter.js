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
      // The SDK's own colors_and_type.css only defines [data-theme="paper"/"ink"/"auto"/"thebird"]
      // blocks -- zellous's own 'light'/'ink' vocabulary matches no CSS rule at
      // all if ever written directly, so even the fallback path must translate.
      if (sdk.applyTheme) sdk.applyTheme(theme === 'light' ? 'paper' : 'ink');
      else document.documentElement.setAttribute('data-theme', theme === 'light' ? 'paper' : 'ink');
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
      pageAuthor: pageData && pageData.author
        ? ((window.chat && window.chat.resolveProfile(pageData.author)) || (window.auth && window.auth.npubShort(pageData.author)) || '')
        : '',
      pageUpdatedAt: pageData ? pageData.updatedAt : 0,
      canManage,
      homeMode: (window.state && window.state.homeMode) || false,
      messages: ((window.chat && window.chat.messages) || v('chatMessages', [])).map((m) => {
        const rx = window.nostrReactions && m.id ? window.nostrReactions.getFor(m.id) : [];
        return rx.length ? { ...m, reactions: rx.map((r) => ({ emoji: r.content, count: r.count, you: r.mine })) } : m;
      }),
      chatInputValue: v('chatInputValue', ''),
      // UserPanel (header) previously fell back to a literal "You" whenever
      // this was null -- while the message-row avatar for the SAME identity
      // derives its initial from resolveProfile(userId), the real npub-based
      // name. Two different fallbacks for one identity produced two
      // different avatar initials ("Y" vs "n") for the same user. Resolving
      // through the same helper keeps both surfaces showing one name.
      currentUser: (() => {
        const pk = window.state && (window.state.userId || window.state.nostrPubkey);
        if (!pk) return v('currentUser', null);
        const resolved = window.chat && window.chat.resolveProfile && window.chat.resolveProfile(pk);
        return resolved ? { id: pk, username: resolved, displayName: resolved } : v('currentUser', null);
      })(),
      userId: (window.state && (window.state.userId || window.state.nostrPubkey)) || null,
      isConnected: v('isConnected', true),
      voiceConnected: v('voiceConnected', false),
      voiceChannelName: v('voiceChannelName', ''),
      voiceConnectionState: v('voiceConnectionState', 'connected'),
      voiceParticipants: v('voiceParticipants', []).map(p => ({ ...p, speaking: !!p.isSpeaking, color: (window.getAvatarColor && window.getAvatarColor(p.identity)) || 'var(--accent)' })),
      micMuted: v('micMuted', false),
      voiceDeafened: v('voiceDeafened', false),
      micRawLevel: v('micRawLevel', 0),
      memberCategories: (window.uiMembers && window.uiMembers.categories && window.uiMembers.categories()) || [],
      memberListOpen: v('memberListOpen', false),
      mobileMenuOpen: v('mobileMenuOpen', false),
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
          // There is no account/password-reset path here by design (the
          // private key IS the identity) -- clearing site data or losing the
          // device is otherwise permanent, unrecoverable identity loss with
          // no conceptual recovery. This is the one mitigation a static
          // client can offer: let the user copy their own key out. Absent
          // entirely (returns null) under NIP-07 extension auth, where the
          // extension -- not this app -- holds key custody.
          (window.auth && window.auth.isLoggedIn && window.auth.isLoggedIn() && window.auth.nsecEncode && window.auth.nsecEncode())
            ? { label: 'Back up key (nsec)', kind: 'button', onClick: () => window.channelManager && window.channelManager.showKeyBackupModal && window.channelManager.showKeyBackupModal() }
            : null,
        ].filter(Boolean),
      }],
      voiceSettingsOpen: v('voiceSettingsOpen', false),
      voiceMode: v('vadEnabled', false) ? 'vad' : 'ptt',
      // Drives the SDK's own .vx-ptt button (mountCommunityApp's voice view) —
      // voice-ptt.js does the real requestTransmit/releaseTransmit gating and
      // publishes its live state as window.state.pttState, not DOM.
      pttUiMode: v('vadEnabled', false) ? 'vad' : 'ptt',
      isSpeaking: v('pttState', 'idle') === 'live',
      inputDeviceId: v('inputDeviceId', null),
      outputDeviceId: v('outputDeviceId', null),
      inputDevices: v('inputDevices', []),
      outputDevices: v('outputDevices', []),
      vadThreshold: v('vadThreshold', 0.15),
      rnnoiseEnabled: v('rnnoiseEnabled', true),
      autoGainEnabled: v('autoGainEnabled', true),
      forceTurnEnabled: v('forceTurnEnabled', false),
      voiceBitrate: v('voiceBitrate', 64),
      masterVolume: v('masterVolume', 0.7),
      replyTarget: v('replyTarget', null),
      threadPanelOpen: v('threadPanelOpen', false),
      activeThreadId: v('activeThreadId', null),
      threads: v('threads', []),
      forumPosts: (curr && curr.type === 'forum' && window.nostrForum) ? window.nostrForum.listFor(curr.id) : [],
      };
    };

    const toastErr = (label, e) => window.ui && window.ui.showToast && window.ui.showToast(label + ' failed: ' + ((e && e.message) || 'unknown'), 3000, 'error');
    const call = (fn, label) => {
      try {
        const r = fn && fn();
        if (r && typeof r.catch === 'function') return r.catch((e) => { if (label) toastErr(label, e); });
        return r;
      } catch (e) { if (label) toastErr(label, e); }
    };
    const actions = {
      switchChannel: (ch) => call(() => window.ui.actions.switchChannel(ch)),
      send: (text, opts) => call(() => { window.chat.send(text, opts); if (S.replyTarget) S.replyTarget.value = null; if (S.chatInputValue) S.chatInputValue.value = ''; else if (window.state) window.state.chatInputValue = ''; }),
      setInput: (val) => { if (S.chatInputValue) S.chatInputValue.value = val; else if (window.state) window.state.chatInputValue = val; },
      startReply: (msg) => call(() => { if (S.replyTarget) S.replyTarget.value = msg; }),
      cancelReply: () => call(() => { if (S.replyTarget) S.replyTarget.value = null; }),
      deleteMessage: (id) => call(() => {
        if (!confirm('Request deletion of this message? Relays are not required to honor this, and other clients may have already cached it — this is not a guarantee the content is gone.')) return;
        if (S.replyTarget && S.replyTarget.value && S.replyTarget.value.id === id) S.replyTarget.value = null;
        return window.chat.deleteMessage(id)?.catch?.((e) => window.ui && window.ui.showToast && window.ui.showToast('Delete failed: ' + (e && e.message || 'unknown'), 3000, 'error'));
      }),
      resolveProfile: (id) => (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(id)) || null,
      reactToMessage: (id, authorPubkey, emoji) => call(() => {
        if (!window.nostrReactions) return;
        const mine = window.nostrReactions.getFor(id).find((r) => r.mine);
        if (mine && (!emoji || mine.content === emoji)) return window.nostrReactions.unreact(id);
        return window.nostrReactions.react(id, authorPubkey, emoji || '+').catch((e) => window.ui && window.ui.showToast && window.ui.showToast('Reaction failed: ' + (e && e.message || 'unknown'), 3000, 'error'));
      }),
      toggleMic: () => call(() => (window.lk && window.lk.toggleMic) ? window.lk.toggleMic() : (window.state.micMuted = !window.state.micMuted)),
      toggleDeafen: () => call(() => (window.lk && window.lk.toggleDeafen) ? window.lk.toggleDeafen() : (window.state.voiceDeafened = !window.state.voiceDeafened)),
      pttStart: () => call(() => window.__zellous && window.__zellous.pttGate && window.__zellous.pttGate.holdStart()),
      pttStop: () => call(() => window.__zellous && window.__zellous.pttGate && window.__zellous.pttGate.holdEnd()),
      leaveVoice: () => call(() => (window.lk && window.lk.disconnect) ? window.lk.disconnect() : (window.voice && window.voice.leave && window.voice.leave())),
      returnToVoice: () => call(() => {
        const name = v('voiceChannelName', '');
        const ch = (window.state.channels || []).find(c => c.type === 'voice' && c.name === name);
        if (ch) window.ui.actions.switchChannel(ch);
      }),
      toggleMembers: () => call(() => window.ui.actions.toggleMembers()),
      openMobileMenu: () => call(() => window.ui.actions.openMobileMenu && window.ui.actions.openMobileMenu()),
      closeMobileMenu: () => call(() => window.ui.actions.closeMobileMenu && window.ui.actions.closeMobileMenu()),
      openSettings: () => call(() => window.ui.actions.toggleSettings && window.ui.actions.toggleSettings()),
      openVoiceSettings: () => call(() => {
        if (S.voiceSettingsOpen) S.voiceSettingsOpen.value = true;
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          navigator.mediaDevices.enumerateDevices().then((devices) => {
            if (S.inputDevices) S.inputDevices.value = devices.filter(d => d.kind === 'audioinput').map(d => ({ value: d.deviceId, label: d.label || 'Microphone' }));
            if (S.outputDevices) S.outputDevices.value = devices.filter(d => d.kind === 'audiooutput').map(d => ({ value: d.deviceId, label: d.label || 'Speaker' }));
          }).catch((e) => { if (window.ui?.showToast) window.ui.showToast('Could not list audio devices: ' + (e?.message || 'unknown error'), 'error'); });
        }
      }),
      voiceSettingsChange: (patch) => call(() => {
        if ('mode' in patch && S.vadEnabled) S.vadEnabled.value = patch.mode === 'vad';
        if ('inputId' in patch && S.inputDeviceId) S.inputDeviceId.value = patch.inputId;
        if ('outputId' in patch && S.outputDeviceId) S.outputDeviceId.value = patch.outputId;
        if ('vadThreshold' in patch && S.vadThreshold) {
          S.vadThreshold.value = patch.vadThreshold;
          try { localStorage.setItem('vadThreshold', String(patch.vadThreshold)); } catch (_) {}
          if (window.lk && window.lk.setMicSensitivity) window.lk.setMicSensitivity(patch.vadThreshold);
        }
        if ('rnnoise' in patch) { if (S.rnnoiseEnabled) S.rnnoiseEnabled.value = patch.rnnoise; try { localStorage.setItem('rnnoise', patch.rnnoise ? '1' : '0'); } catch (_) {} }
        if ('autoGain' in patch) { if (S.autoGainEnabled) S.autoGainEnabled.value = patch.autoGain; try { localStorage.setItem('autoGain', patch.autoGain ? '1' : '0'); } catch (_) {} }
        if ('forceTurn' in patch) {
          if (S.forceTurnEnabled) S.forceTurnEnabled.value = patch.forceTurn;
          try { localStorage.setItem('forceRelay', patch.forceTurn ? '1' : '0'); } catch (_) {}
          if (window.lk && window.lk.setForceRelay) window.lk.setForceRelay(!!patch.forceTurn);
        }
        if ('bitrate' in patch && S.voiceBitrate) {
          S.voiceBitrate.value = patch.bitrate;
          try { localStorage.setItem('voiceBitrate', String(patch.bitrate)); } catch (_) {}
          if (window.lk && window.lk.setAudioBitrate) window.lk.setAudioBitrate(patch.bitrate);
        }
        if (window.lk && window.lk.setAudioConstraints) window.lk.setAudioConstraints({ deviceId: v('inputDeviceId', null), noiseSuppression: v('rnnoiseEnabled', true), autoGainControl: v('autoGainEnabled', true) });
      }),
      voiceSettingsSave: () => call(() => { if (S.voiceSettingsOpen) S.voiceSettingsOpen.value = false; }),
      voiceSettingsClose: () => call(() => { if (S.voiceSettingsOpen) S.voiceSettingsOpen.value = false; }),
      goHome: () => call(() => {
        // homeMode only drives the sidebar's active-highlight in the SDK
        // (community-app.js line ~121) -- it does NOT clear the rendered
        // channel list or chat body on its own. Without also resetting these,
        // switching to "home" left the PREVIOUS server's rooms/messages fully
        // visible: only the highlighted rail item and status-bar label
        // changed, matching the exact reported bug. serverManager.switchTo
        // already resets this same state when switching to a real server;
        // goHome needs the same reset since there is no dedicated "home"
        // content surface to switch into.
        window.state.homeMode = true;
        window.state.currentServerId = null;
        window.state.currentChannelId = null;
        window.state.currentChannel = null;
        window.state.channels = [];
        window.state.categories = [];
        window.state.chatMessages = [];
        if (window.chat) window.chat.messages = [];
      }),
      // The SDK's real "servers" nav link (community-app.js) already calls
      // this directly with e.preventDefault() -- there is no separate
      // "servers browser" surface to open, so this toggles the same
      // home/server view goHome()/switchServer() already drive. The legacy
      // #zServersBtn anchor this used to click had no listener of its own
      // (a real dead link, `href="#"` with zero JS behind it) -- removed
      // rather than routed through, since there was nothing there to reach.
      openServers: () => call(() => {
        if (window.state.homeMode) {
          const first = (window.state.servers || [])[0];
          if (first) { window.state.homeMode = false; window.serverManager.switchTo(first.id); }
        } else {
          window.state.homeMode = true; window.state.currentServerId = null;
        }
      }),
      switchServer: (id) => call(() => { window.state.homeMode = false; window.serverManager.switchTo(id); }),
      channelContext: (id, x, y) => call(() => window.channelManager.showContextMenu(id, x, y)),
      createChannel: () => call(() => window.channelManager.showCreateModal(null, null)),
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
      newForumPost: () => call(() => window.channelManager && window.channelManager.showNewForumPostModal()),
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
        if (!ch || ch.type !== 'page' || !window.serverPages || !window.serverManager) return;
        const existing = (window.serverPages.getPages(ch._serverId) || []).find(p => p.slug === ch._slug);
        window.serverManager.showEditPageModal(ch._serverId, ch._slug, existing ? existing.title : ch.name, existing ? existing.html : '');
      }),
    };

    const helpers = {
      avatarColor: (id) => (window.getAvatarColor && window.getAvatarColor(id)) || 'var(--accent)',
      initial: (n) => (window.getInitial ? window.getInitial(n) : String(n || '?').slice(0, 1).toUpperCase()),
      formatTime: (t) => (window.formatTime ? window.formatTime(t) : new Date(t || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })),
    };

    const SIGNALS = ['channels', 'categories', 'servers', 'currentChannel', 'currentServerId', 'chatMessages', 'messages', 'chatInputValue', 'currentUser', 'isConnected', 'voiceConnected', 'voiceChannelName', 'voiceConnectionState', 'voiceParticipants', 'micMuted', 'voiceDeafened', 'micRawLevel', 'showAuthModal', 'authMode', 'authError', 'authBusy', 'settingsOpen', 'voiceSettingsOpen', 'vadEnabled', 'inputDeviceId', 'outputDeviceId', 'inputDevices', 'outputDevices', 'vadThreshold', 'rnnoiseEnabled', 'autoGainEnabled', 'forceTurnEnabled', 'voiceBitrate', 'masterVolume', 'replyTarget', 'threadPanelOpen', 'activeThreadId', 'threads', 'pagesVersion', 'themePref', 'notificationsEnabled', 'messagePreviewEnabled', 'soundEnabled', 'mobileMenuOpen', 'memberListOpen', 'pttState', 'roomMembers'];
    const subscribe = (cb) => {
      // preact effect: reading each .value registers a dependency, so cb re-fires on any change
      return effect(() => { for (const n of SIGNALS) { if (S[n]) void S[n].value; } cb(); });
    };

    const adapter = { get, subscribe, actions, helpers, brandName: 'zellous' };
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
