export function installGovernance(ww) {
  const roles = ww.roles;
  roles.addEventListener('updated', () => { state.rolesVersion = (state.rolesVersion || 0) + 1; });
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
    kickFromVoice: (sid, pk) => bans.kickFromVoice(sid, pk)
  };

  const mutes = ww.mutes;
  mutes.addEventListener('updated', () => {
    state.mutesVersion = (state.mutesVersion || 0) + 1;
    const ch = state.currentChannel;
    if (ch && (ch.type === 'text' || ch.type === 'announcement') && window.chat?.loadHistory) window.chat.loadHistory(ch.id);
  });
  window.nostrMutes = {
    isMuted: (pk) => mutes.isMuted(pk),
    list: () => mutes.list(),
    mute: (pk) => mutes.mute(pk),
    unmute: (pk) => mutes.unmute(pk)
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
  pages.addEventListener('updated', () => { state.pagesVersion = (state.pagesVersion || 0) + 1; });
  window.serverPages = {
    _store: pages.store,
    getPages: (sid) => pages.getPages(sid),
    subscribe: (sid) => pages.subscribe(sid),
    unsubscribe: (sid) => pages.unsubscribe(sid),
    publish: (sid, slug, t, h) => pages.publish(sid, slug, t, h),
    deletePage: (sid, slug) => pages.deletePage(sid, slug)
  };
}
