window.__wireweaveReady = (async () => {
  const mod = await import('../vendor/wireweave/src/index.js');
  const NT = window.NostrTools;
  const XS = { createMachine: window.XState.createMachine, createActor: window.XState.createActor };

  const ww = mod.createWireweave({
    nostrTools: NT,
    xstate: XS,
    storage: localStorage,
    extension: window.nostr,
    relays: state.nostrRelays || ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol', 'wss://relay.snort.social']
  });

  // FSM bridge
  window.nostrFsm = { voiceMachine: ww.fsm.voiceMachine, peerMachine: ww.fsm.peerMachine, cameraMachine: ww.fsm.cameraMachine };

  // Relay pool bridge
  const net = ww.pool;
  window.nostrNet = window.network = {
    connect: () => net.connect(),
    disconnect: () => net.disconnect(),
    subscribe: (id, filters, onEvent, onEose) => net.subscribe(id, filters, onEvent, onEose),
    unsubscribe: (id) => net.unsubscribe(id),
    publish: (event) => net.publish(event),
    isConnected: () => net.isConnected(),
    reconnectAll: () => net.heal(),
    get relays() { return new Map(net.relays); }
  };
  net.addEventListener('relay-status', (e) => {
    const { url, status } = e.detail;
    const m = new Map(state.nostrRelayStatus || []);
    m.set(url, status);
    state.nostrRelayStatus = m;
    const anyOpen = net.isConnected();
    if (state.isConnected !== anyOpen) state.isConnected = anyOpen;
    if (window.ui) ui.render.all();
  });
  window.__debugNet = { get relays() { return net.status(); } };

  // Auth bridge
  const a = ww.auth;
  a.loadFromStorage();
  a.addEventListener('storage-error', (e) => { if (window.ui) ui.showToast(e.detail.message || 'Storage error', 4000, 'error'); });
  a.addEventListener('persist-failed', () => { if (window.ui) ui.showToast('Could not save your login key — storage is full. Free up space or your session won\'t persist after reload.', 6000, 'error'); });
  window.auth = {
    get user() {
      const pk = a.pubkey; if (!pk) return null;
      const short = a.npubShort(pk);
      return { id: pk, username: short, displayName: state.nostrProfile?.name || short };
    },
    init() {
      if (!a.pubkey) return false;
      state.nostrPrivkey = a.privkey; state.nostrPubkey = a.pubkey;
      const short = a.npubShort(a.pubkey);
      const nameEl = document.getElementById('userPanelName'); if (nameEl) nameEl.textContent = short;
      const tagEl = document.getElementById('userPanelTag'); if (tagEl) tagEl.textContent = short;
      const avatarEl = document.getElementById('userPanelAvatar');
      if (avatarEl) { const n = avatarEl.childNodes[0]; if (n?.nodeType === 3) n.textContent = short[0].toUpperCase(); }
      document.getElementById('userStatusDot')?.classList.add('online');
      return true;
    },
    generateKey() { const r = a.generateKey(); state.nostrPrivkey = r.privkey; state.nostrPubkey = r.pubkey; return r; },
    importKey(input) { try { const r = a.importKey(input); state.nostrPrivkey = r.privkey; state.nostrPubkey = r.pubkey; return true; } catch { return false; } },
    async loginWithExtension() { const pk = await a.loginWithExtension(); state.nostrPubkey = pk; state.nostrPrivkey = null; return pk; },
    sign: (t) => a.sign(t),
    async setDisplayName(name) {
      if (!a.pubkey) throw new Error('Not logged in');
      if (!name?.trim()) throw new Error('Invalid display name');
      const signed = await a.sign({ kind: 0, created_at: Math.floor(Date.now() / 1000), tags: [], content: JSON.stringify({ name: name.trim(), ...(state.nostrProfile || {}) }) });
      net.publish(signed);
      state.nostrProfile = { ...(state.nostrProfile || {}), name: name.trim() };
      const nameEl = document.getElementById('userPanelName'); if (nameEl) nameEl.textContent = state.nostrProfile.name;
      const avatarEl = document.getElementById('userPanelAvatar');
      if (avatarEl) { const n = avatarEl.childNodes[0]; if (n?.nodeType === 3) n.textContent = state.nostrProfile.name[0].toUpperCase(); }
      if (window.chat) chat.updateProfile(a.pubkey, state.nostrProfile);
    },
    logout() { a.logout(); state.nostrPubkey = ''; state.nostrPrivkey = null; state.nostrProfile = null; net.disconnect(); },
    getToken: () => a.pubkey || null,
    isLoggedIn: () => a.isLoggedIn(),
    npubShort: (pk) => a.npubShort(pk),
    showModal() {
      const modal = document.getElementById('authModal'); if (!modal) return;
      modal.style.display = 'flex';
      const cv = document.getElementById('nostrConnectView'); const lv = document.getElementById('nostrLoggedInView');
      const loggedIn = a.isLoggedIn();
      if (cv) cv.style.display = loggedIn ? 'none' : 'flex';
      if (lv) lv.style.display = loggedIn ? 'flex' : 'none';
      if (loggedIn) {
        const d = document.getElementById('nostrNpubDisplay'); if (d) d.textContent = a.npubShort();
        const inp = document.getElementById('displayNameInput'); if (inp) inp.value = state.nostrProfile?.name || '';
      }
    },
    hideModal() { const modal = document.getElementById('authModal'); if (modal) modal.style.display = 'none'; },
    _afterLogin() {
      const d = document.getElementById('nostrNpubDisplay'); if (d) d.textContent = a.npubShort();
      const cv = document.getElementById('nostrConnectView'); const lv = document.getElementById('nostrLoggedInView');
      if (cv) cv.style.display = 'none'; if (lv) lv.style.display = 'flex';
      const err = document.getElementById('nostrAuthError'); if (err) err.textContent = '';
      const short = a.npubShort();
      const nameEl = document.getElementById('userPanelName');
      const tagEl = document.getElementById('userPanelTag');
      const avatarEl = document.getElementById('userPanelAvatar');
      if (nameEl) nameEl.textContent = state.nostrProfile?.name || short;
      if (tagEl) tagEl.textContent = short;
      if (avatarEl) { const n = avatarEl.childNodes[0]; if (n?.nodeType === 3) n.textContent = (state.nostrProfile?.name || short)[0].toUpperCase(); }
      document.getElementById('userStatusDot')?.classList.add('online');
      document.dispatchEvent(new CustomEvent('nostr:login'));
      setTimeout(() => window.auth.hideModal(), 1000);
    },
    _err(msg) { const el = document.getElementById('nostrAuthError'); if (el) el.textContent = msg; },
    bindUI() {
      const $ = id => document.getElementById(id);
      const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
      on('connectExtensionBtn', async () => { try { if (!window.nostr) throw new Error('No Nostr extension found'); await window.auth.loginWithExtension(); window.auth._afterLogin(); } catch (e) { window.auth._err(e.message); } });
      on('generateKeyBtn', () => { try { window.auth.generateKey(); window.auth._afterLogin(); } catch (e) { window.auth._err(e.message); } });
      on('importKeyBtn', () => { const inp = $('importKeyInput'); const val = inp ? inp.value.trim() : ''; if (!val) { window.auth._err('Enter a key'); return; } window.auth.importKey(val) ? window.auth._afterLogin() : window.auth._err('Invalid key'); });
      on('copyNpubBtn', () => { const pk = a.pubkey; if (pk) navigator.clipboard.writeText(a.npubEncode(pk)).catch(() => {}); });
      on('saveDisplayNameBtn', async () => { const inp = $('displayNameInput'); const val = inp ? inp.value.trim() : ''; if (!val) { window.auth._err('Enter a display name'); return; } try { await window.auth.setDisplayName(val); } catch (e) { window.auth._err(e.message); } });
      on('nostrLogoutBtn', () => { window.auth.logout(); window.auth.showModal(); });
      const modal = document.getElementById('authModal');
      if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) window.auth.hideModal(); });
      const av = document.querySelector('.user-avatar, .username-area, [data-action="show-auth"]');
      if (av) av.addEventListener('click', () => window.auth.showModal());
    }
  };

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
  chat.addEventListener('messages', (e) => { state.chatMessages = e.detail.list; _updateChatMembers(e.detail.list); if (window.ui) ui.render.all(); });
  setInterval(() => { if ((state.chatMessages||[]).length) { _updateChatMembers(state.chatMessages); if (window.ui) ui.render.all(); } }, 60000);
  chat.addEventListener('profile', () => { if (window.ui) ui.render.all(); });
  const ONLINE_WINDOW_MS = 5 * 60 * 1000;
  function _updateChatMembers(msgs) {
    const lastSeen = new Map();
    (msgs || []).forEach(m => {
      if (!m.userId) return;
      const ts = m.timestamp || 0;
      if (!lastSeen.has(m.userId) || ts > lastSeen.get(m.userId)) lastSeen.set(m.userId, ts);
    });
    const now = Date.now();
    state.roomMembers = Array.from(lastSeen.entries()).map(([id, ts]) => ({
      id, username: chat.resolveProfile(id), online: (now - ts) <= ONLINE_WINDOW_MS
    }));
  }
  window.chat = {
    activeChannelId: null,
    get messages() { return state.chatMessages || []; },
    set messages(v) { state.chatMessages = v; },
    send: (c) => chat.send(c),
    sendAnnouncement: (t) => chat.send(t, { announcement: true }),
    sendImage(file) {
      if (!file) { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*,video/*'; i.onchange = () => { if (i.files[0]) window.nostrMedia.sendMedia(i.files[0]).catch(e => window.message.add('Upload failed: ' + e.message)); }; i.click(); return; }
      window.nostrMedia.sendMedia(file).catch(e => window.message.add('Upload failed: ' + e.message));
    },
    async loadHistory(channelId) { window.chat.activeChannelId = channelId; ww.setCurrentChannel(channelId); await chat.loadHistory(channelId); },
    deleteMessage: (id) => chat.deleteMessage(id),
    editMessage() { if (window.ui?.showToast) ui.showToast('Nostr messages cannot be edited'); },
    resolveProfile: (pk) => chat.resolveProfile(pk),
    updateProfile: (pk, p) => chat.updateProfile(pk, p),
    linkify(html) {
      return html.replace(/https?:\/\/[^\s<>"]+/g, (url) => {
        const kind = window.nostrMedia?.isMedia(url);
        if (kind === 'image') return `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" style="max-width:100%;max-height:300px;margin-top:4px;display:block" loading="lazy"></a>`;
        if (kind === 'video') return `<video src="${url}" controls style="max-width:100%;max-height:300px;margin-top:4px;display:block"></video>`;
        return `<a href="${url}" target="_blank" rel="noopener">${url}</a>`;
      });
    },
    handleTextMessage(m) { chat._addMessage(m); },
    handleImageMessage() {}, handleFileShared() {}
  };

  // Channels bridge
  const ch = ww.channels;
  ch.addEventListener('updated', (e) => {
    state.channels = e.detail.channels; state.categories = e.detail.categories;
    if (window.ui) ui.render.all();
    // If the channel we're currently in voice on had its voiceMode change, re-apply.
    if (state.voiceConnected && state.currentChannel && window.__zellous?.voiceMode) {
      const cur = (e.detail.channels || []).find(c => c.id === state.currentChannel.id);
      if (cur) {
        state.currentChannel = cur;
        window.__zellous.voiceMode.apply();
      }
    }
    // Update the chat-header topic if the current channel's topic was changed.
    if (state.currentChannel) {
      const cur = (e.detail.channels || []).find(c => c.id === state.currentChannel.id);
      if (cur) state.currentChannel = cur;
    }
  });
  window.channelManager = {
    isOwner: () => a.pubkey && state.currentServerId && a.pubkey === state.currentServerId.split(':')[0],
    loadChannels: (sid, onReady) => ch.load(sid, onReady),
    _setDefaults: () => ch._setDefaults(),
    _publishChannelList: () => ch._publish(),
    create: (n, t, c) => ch.create(n, t, c),
    rename: (id, n) => ch.rename(id, n),
    update: (id, patch) => ch.update(id, patch),
    remove: (id) => ch.remove(id),
    createCategory: (n) => ch.createCategory(n),
    renameCategory: (id, n) => ch.renameCategory(id, n),
    deleteCategory: (id) => ch.deleteCategory(id),
    reorderChannels: (cat, ids) => ch.reorder(cat, ids),
    reorderCategories: (ids) => ch.reorderCategories(ids),
    hideContextMenu() {
      document.getElementById('channelContextMenu')?.remove();
      document.getElementById('categoryContextMenu')?.remove();
    }
  };

  // Servers bridge
  const srv = ww.servers;
  srv.addEventListener('storage-error', (e) => { if (window.ui) ui.showToast(e.detail.message || 'Storage full — some data may not be saved', 4000, 'error'); });
  srv.addEventListener('updated', (e) => { state.servers = e.detail.servers; if (window.ui) ui.render.all(); });
  srv.addEventListener('switched', (e) => { state.currentServerId = e.detail.serverId; state.chatMessages = []; state.channels = []; state.categories = []; if (window.ui) ui.render.all(); });
  window.serverManager = {
    loadServers: () => srv.load(),
    create: (n, c) => srv.create(n, c),
    rename: (sid, n, c) => srv.rename(sid, n, c),
    kickFromVoice: (pk) => bans.kickFromVoice(pk),
    banUserNostr: (sid, pk) => bans.ban(sid, pk),
    timeoutUserNostr: (sid, pk, min) => bans.timeout(sid, pk, min),
    join: (sid) => srv.join(sid),
    delete: (sid) => srv.delete(sid),
    leave: (sid) => srv.leave(sid),
    switchTo: async (sid) => {
      state.homeMode = false;
      document.getElementById('homeServer')?.classList.remove('active');
      await srv.switchTo(sid);
      const firstText = state.channels?.find(c => c.type === 'text');
      if (firstText && state.currentChannelId !== firstText.id) {
        state.currentChannelId = firstText.id; state.currentChannel = firstText;
        window.chat.loadHistory(firstText.id);
      }
      if (window.ui) ui.render.all();
    },
    init: async () => {
      srv.init();
      // First-run experience: a brand-new identity has zero servers, so the rail
      // and channel list render empty and the user sees "no voice, no servers".
      // Auto-create a personal "Zellous" server so they immediately land in a
      // populated space — switching to it triggers onSwitch → channels.load →
      // the default general(text) + General(voice) channels, making voice & a
      // server visible on first load. Guarded so it only fires once.
      if (!srv.servers.length && srv.auth?.pubkey && srv.storage.getItem('zn_firstRunDone') !== '1') {
        try {
          await srv.create('Zellous', '#5865F2');
          srv.storage.setItem('zn_firstRunDone', '1');
          // create() emits 'updated' but the first-paint signal read can race it;
          // sync state explicitly so the new server pill shows on the first load.
          state.servers = srv.servers;
          if (window.ui) ui.render.all();
        } catch (e) { console.warn('[zellous] first-run server create failed', e?.message); }
      }
    },
    renderList: () => { /* handled by nostr-servers-ui.js which remains */ }
  };

  // Roles / Bans / Settings / Pages / Media bridges
  const roles = ww.roles;
  roles.addEventListener('updated', () => { if (window.uiMembers?.render) uiMembers.render(); });
  window.serverRoles = {
    _store: roles.store,
    isOwner: (sid) => roles.isOwner(sid),
    isAdmin: (sid) => roles.isAdmin(sid),
    isMod: (sid) => roles.isMod(sid),
    getRole: (sid, pk) => roles.getRole(sid, pk),
    setRole: (sid, pk, r) => roles.setRole(sid, pk, r),
    subscribe: (sid) => roles.subscribe(sid)
  };

  const bans = ww.bans;
  window.nostrBans = {
    _store: bans.store,
    isBanned: (sid, pk) => bans.isBanned(sid, pk),
    isTimedOut: (sid, pk) => bans.isTimedOut(sid, pk),
    subscribe: (sid) => bans.subscribe(sid),
    ban: (sid, pk) => bans.ban(sid, pk),
    timeout: (sid, pk, m) => bans.timeout(sid, pk, m),
    kickFromVoice: (pk) => bans.kickFromVoice(pk)
  };

  const settings = ww.settings;
  window.serverSettings = {
    _store: settings.store,
    getBitrate: (sid) => settings.getBitrate(sid),
    setBitrate: (sid, b) => settings.setBitrate(sid, b),
    getEmbedAllowlist: (sid) => settings.getEmbedAllowlist(sid),
    setEmbedAllowlist: (sid, d) => settings.setEmbedAllowlist(sid, d),
    isOriginAllowed: (sid, o) => settings.isOriginAllowed(sid, o),
    subscribe: (sid) => settings.subscribe(sid),
    applyToEncoder() {
      const bitrate = settings.getBitrate(state.currentServerId);
      if (state.audioEncoder) { try { state.audioEncoder.configure({ codec: 'opus', sampleRate: config.sampleRate, numberOfChannels: 1, bitrate }); } catch {} }
    }
  };

  const pages = ww.pages;
  pages.addEventListener('updated', () => { state.pagesVersion = (state.pagesVersion || 0) + 1; if (window.uiChannels?.render) uiChannels.render(); });
  window.serverPages = {
    _store: pages.store,
    getPages: (sid) => pages.getPages(sid),
    subscribe: (sid) => pages.subscribe(sid),
    unsubscribe: (sid) => pages.unsubscribe(sid),
    publish: (sid, slug, t, h) => pages.publish(sid, slug, t, h),
    deletePage: (sid, slug) => pages.deletePage(sid, slug)
  };

  const media = ww.media;
  window.nostrMedia = {
    upload: (f) => media.upload(f),
    isMedia: (u) => media.isMedia(u),
    extractUrls: (t) => media.extractUrls(t),
    async sendMedia(file) {
      const r = await media.sendMedia(file, { channelId: state.currentChannelId, serverId: state.currentServerId || '' });
      window.chat && window.chat.handleTextMessage && chat.handleTextMessage({ id: r.signed.id, type: 'text', userId: r.signed.pubkey, content: r.signed.content, timestamp: r.signed.created_at * 1000, tags: [] });
      return r;
    }
  };

  // Voice bridge — the main one
  let voice = null;
  const ensureVoice = () => {
    if (voice) { voice.serverId = state.currentServerId || ''; return voice; }
    voice = ww.ensureVoice({
      serverId: state.currentServerId || '',
      displayName: state.nostrProfile?.name || (a.pubkey ? a.npubShort() : 'Guest'),
      onAudioTrack: ({ peer, stream, peerPubkey }) => {
        if (!peer.audioEl) {
          const el = new Audio();
          el.autoplay = true;
          el.playsInline = true;
          el.muted = !!state.voiceDeafened;
          el.volume = 1.0;
          el.style.display = 'none';
          document.body.appendChild(el);
          peer.audioEl = el;
        }
        peer.audioEl.srcObject = stream;
        const tryPlay = () => peer.audioEl.play().catch(() => {
          const resume = () => { peer.audioEl?.play().catch(() => {}); document.removeEventListener('click', resume); document.removeEventListener('keydown', resume); document.removeEventListener('touchstart', resume); };
          document.addEventListener('click', resume, { once: true });
          document.addEventListener('keydown', resume, { once: true });
          document.addEventListener('touchstart', resume, { once: true });
        });
        tryPlay();
      },
      onVideoTrack: ({ peerPubkey, stream }) => {
        const key = 'nostr-' + peerPubkey.slice(0, 12);
        const p = voice.participants.get(key);
        if (p) { p.hasVideo = true; p._videoStream = stream; }
        const elId = 'vtile-video-' + peerPubkey.slice(0, 8);
        let el = document.getElementById(elId);
        if (!el) {
          el = document.createElement('video'); el.id = elId; el.autoplay = true; el.playsinline = true;
          el.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:8px';
          const wrap = document.getElementById('vtile-wrap-' + peerPubkey.slice(0, 8));
          if (wrap) wrap.appendChild(el);
        }
        el.srcObject = stream;
      }
    });
    voice.addEventListener('state', (e) => { state.voiceConnectionState = e.detail.value === 'connected' ? 'connected' : e.detail.value === 'idle' ? 'disconnected' : e.detail.value; state.voiceConnected = e.detail.value === 'connected'; });
    voice.addEventListener('participants', (e) => { state.voiceParticipants = e.detail.list; if (window.uiVoice) { uiVoice.renderGrid(); uiVoice.renderPanel(); } if (window.uiChannels) uiChannels.render(); });
    voice.addEventListener('connected', (e) => { state.voiceChannelName = e.detail.channelName; if (window.ui?.voicePanel) ui.voicePanel.classList.add('visible'); if (window.ui?.voicePanelChannel) ui.voicePanelChannel.textContent = e.detail.channelName; window.message.add('Voice connected'); });
    voice.addEventListener('disconnected', () => { state.voiceChannelName = ''; state.voiceParticipants = []; state.voiceDeafened = false; state.micMuted = false; state.activeSpeakers = new Set(); if (window.ui?.voicePanel) ui.voicePanel.classList.remove('visible'); if (window.uiVoice) { uiVoice.renderGrid(); uiVoice.renderPanel(); } });
    voice.addEventListener('mic', (e) => { state.micMuted = !!e.detail.muted; document.getElementById('voiceMicBtn')?.classList.toggle('muted', state.micMuted); document.getElementById('voiceMicBtn')?.classList.toggle('active', !state.micMuted); document.getElementById('micToggleBtn')?.classList.toggle('muted', state.micMuted); });
    voice.addEventListener('speaker', () => { try { state.activeSpeakers = new Set(voice.getParticipants().filter(p => p.isSpeaking && !p.isLocal).map(p => p.identity)); } catch {} });
    return voice;
  };

  const voiceAPI = {
    get _participants() { return ensureVoice().participants; },
    get _peers() { return ensureVoice().peers; },
    get _roomId() { return ensureVoice().roomId; },
    get _channelName() { return ensureVoice().channelName; },
    async connect(ch) { const v = ensureVoice(); v.serverId = state.currentServerId || ''; await v.connect(ch, { displayName: state.nostrProfile?.name || a.npubShort() || 'Guest' }); state.micMuted = !!v.muted; },
    async disconnect() { if (voice) await voice.disconnect(); },
    toggleMic() { const v = ensureVoice(); v.toggleMic(); state.micMuted = !!v.muted; document.getElementById('micToggleBtn')?.classList.toggle('muted', state.micMuted); document.getElementById('voiceMicBtn')?.classList.toggle('active', !state.micMuted); },
    setMuted(want) { const v = ensureVoice(); v.setMuted(!!want); state.micMuted = !!v.muted; document.getElementById('micToggleBtn')?.classList.toggle('muted', state.micMuted); document.getElementById('voiceMicBtn')?.classList.toggle('active', !state.micMuted); },
    requestTransmit() { const v = ensureVoice(); const live = v.requestTransmit(); state.micMuted = !!v.muted; return live; },
    releaseTransmit() { const v = ensureVoice(); v.releaseTransmit(); state.micMuted = !!v.muted; },
    anyRemoteSpeaking() { return voice ? voice.anyRemoteSpeaking() : false; },
    toggleDeafen() { ensureVoice().toggleDeafen(); state.voiceDeafened = voice.deafened; document.getElementById('deafenToggleBtn')?.classList.toggle('muted', state.voiceDeafened); document.getElementById('voiceDeafenBtn')?.classList.toggle('active', state.voiceDeafened); },
    async toggleCamera() { /* camera handled via onVideoTrack above; full port deferred */ },
    updateParticipants() { if (voice) { state.voiceParticipants = voice.getParticipants(); if (window.uiVoice) { uiVoice.renderGrid(); uiVoice.renderPanel(); } if (window.uiChannels) uiChannels.render(); } },
    isDataChannelReady: () => { if (!voice) return false; for (const [, p] of voice.peers) if (p.dc?.readyState === 'open') return true; return false; },
    updateVoiceGrid() { voiceAPI.updateParticipants(); },
    on(evt, fn) { ensureVoice().addEventListener(evt, fn); return () => voice?.removeEventListener(evt, fn); },
    get __debug() { return voice?.debug() || null; }
  };
  window.nostrVoice = voiceAPI;
  window.lk = voiceAPI;
  window.nostrVoiceRtc = { maybeConnect: (pk) => voice?._maybeConnect(pk), handleSignal: (e) => voice?._handleSignal(e), subscribe: () => {}, publish: () => {}, cancelReconnect: (pk) => voice?._cancelReconnect(pk), scheduleReconnect: (pk, a) => voice?._scheduleReconnect(pk, a) };
  window.nostrVoiceSfu = { start: () => voice?._sfuStart(), stop: () => voice?._sfuStop(), onPresenceRtt: (pk, s) => { if (voice) voice.sfu.rttMatrix.set(pk, s); voice?._sfuMaybeElect(); }, get __debug() { if (!voice) return null; const m = {}; voice.sfu.rttMatrix.forEach((v, k) => m[k.slice(0, 12)] = v); return { mode: voice.sfu.actor?.getSnapshot().value, hub: voice.sfu.hub?.slice(0, 12) || null, rttMatrix: m }; } };
  window.nostrVoiceCamera = { toggle: () => voiceAPI.toggleCamera(), start: () => voiceAPI.toggleCamera(), stop: () => voiceAPI.toggleCamera() };

  // state-patch replacement: no-op (state.js already has all signals)
  window.nostrFsm = window.nostrFsm;

  // Ready flag for legacy code
  window.__zellous = window.__zellous || {};
  Object.assign(window.__zellous, { net: window.nostrNet, auth: window.auth, chat: window.chat, channels: window.channelManager, servers: window.serverManager, voice: window.nostrVoice, message: window.message, roles: window.serverRoles, bans: window.nostrBans, settings: window.serverSettings, pages: window.serverPages, media: window.nostrMedia, fsm: window.nostrFsm, wireweave: ww });

  document.dispatchEvent(new CustomEvent('wireweave:ready'));
  return true;
})();
