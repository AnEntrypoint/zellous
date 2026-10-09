window.__wireweaveReady = (async () => {
  const [bootStatus, network, auth, chat, unread, dm, channels, servers, governance, forum, media, voice] = await Promise.all([
    import('./bridge/boot-status.js'),
    import('./bridge/network.js'),
    import('./bridge/auth.js'),
    import('./bridge/chat.js'),
    import('./bridge/unread.js'),
    import('./bridge/dm.js'),
    import('./bridge/channels.js'),
    import('./bridge/servers.js'),
    import('./bridge/governance.js'),
    import('./bridge/forum.js'),
    import('./bridge/media.js'),
    import('./bridge/voice.js')
  ]);
  const mod = await bootStatus.loadProtocol();
  const NT = window.NostrTools;
  const XS = { createMachine: window.XState.createMachine, createActor: window.XState.createActor };

  const ww = mod.createWireweave({
    nostrTools: NT,
    xstate: XS,
    storage: localStorage,
    extension: window.nostr,
    relays: state.nostrRelays || ['wss://relay.damus.io', 'wss://relay.primal.net', 'wss://nos.lol', 'wss://relay.snort.social']
  });

  window.nostrFsm = { voiceMachine: ww.fsm.voiceMachine, peerMachine: ww.fsm.peerMachine, cameraMachine: ww.fsm.cameraMachine };

  network.installNetwork(ww);
  const { generateKeyWithConfirm } = auth.installAuth(ww);
  chat.installChat(ww);
  unread.installUnread(ww);
  dm.installDm(ww);
  channels.installChannels(ww);
  servers.installServers(ww);
  governance.installGovernance(ww);
  forum.installForum(ww);
  media.installMedia(ww);
  voice.installVoice(ww);

  const inspect = () => ({
    relays: Object.fromEntries(state.nostrRelayStatus || []),
    voiceParticipants: (state.voiceParticipants || []).map((p) => ({
      identity: p.identity,
      isLocal: !!p.isLocal,
      isSpeaking: !!p.isSpeaking,
      isMuted: !!p.isMuted,
      hasVideo: !!p.hasVideo,
      connectionQuality: p.connectionQuality ?? null
    })),
    voiceState: state.voiceConnectionState,
    voiceListenOnly: !!state.voiceListenOnly,
    unread: window.nostrUnread ? window.nostrUnread.countsFor() : {}
  });
  window.__zellous = window.__zellous || {};
  window.__zellous.generateKeyWithConfirm = generateKeyWithConfirm;
  Object.assign(window.__zellous, { net: window.nostrNet, auth: window.auth, chat: window.chat, dm: window.dm, channels: window.channelManager, servers: window.serverManager, voice: window.nostrVoice, message: window.message, roles: window.serverRoles, bans: window.nostrBans, mutes: window.nostrMutes, settings: window.serverSettings, pages: window.serverPages, forum: window.nostrForum, media: window.nostrMedia, fsm: window.nostrFsm, reactions: window.nostrReactions, unread: window.nostrUnread, wireweave: ww, inspect });

  document.addEventListener('nostr:login', () => { window.nostrNet.connect(); window.dm.subscribeAll(); });
  if (ww.auth.pubkey) window.dm.subscribeAll();

  bootStatus.announceReady();
  return true;
})();
