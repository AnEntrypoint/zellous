// Fixed serverId every visitor's init() converges on, so independent
// visitors land in the same chat.js hexChannelId tag scope instead of
// each getting an unreachable private pubkey:random server.
// The leading zero-pubkey is not a real generated key (no one holds its
// private key), so channels.js/roles.js/bans.js/settings.js isOwner()/
// isAdmin() correctly resolve false for every real visitor -- the room is
// ownerless/adminless by construction, never a spoofable elevated identity.
const ZELLOUS_PUBLIC_SERVER_ID = '0000000000000000000000000000000000000000000000000000000000000000:public';

export function installServers(ww) {
  const bans = ww.bans;
  // Servers bridge
  const srv = ww.servers;
  srv.addEventListener('storage-error', (e) => { if (window.ui) ui.showToast(e.detail.message || 'Storage full — some data may not be saved', 4000, 'error'); });
  srv.addEventListener('updated', (e) => { state.servers = e.detail.servers; if (window.ui) ui.render.all(); });
  srv.addEventListener('switched', (e) => { state.currentServerId = e.detail.serverId; state.chatMessages = []; state.channels = []; state.categories = []; if (window.ui) ui.render.all(); });
  window.serverManager = {
    loadServers: () => srv.load(),
    create: (n, c) => srv.create(n, c),
    rename: (sid, n, c) => srv.rename(sid, n, c),
    kickFromVoice: (pk) => bans.kickFromVoice(state.currentServerId, pk),
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
      // Every identity converges on the shared public room (fixed, well-known
      // serverId) whenever it is missing from the rail -- not only on a
      // zero-server first run. Pre-fix visitors carry a private per-user
      // serverId in localStorage; since chat.js and voice.js scope everything
      // by SHA-256(serverId+channel), two such visitors sit in disjoint rooms
      // and never see each other (the reported voice-room bug). Membership
      // check makes the join idempotent across reloads. select is true only
      // for zero-server fresh visitors: they get landed in the public room,
      // while a legacy visitor keeps their current selection and merely
      // gains the public server on the rail as the shared rendezvous.
      if (srv.auth?.pubkey && !srv.servers.find(s => s.id === ZELLOUS_PUBLIC_SERVER_ID)) {
        try {
          await srv.join(ZELLOUS_PUBLIC_SERVER_ID, { name: 'Zellous Public', select: !srv.servers.length });
          // join() emits 'updated' but the first-paint signal read can race it;
          // sync state explicitly so the new server pill shows on the first load.
          state.servers = srv.servers;
          if (window.ui) ui.render.all();
        } catch (e) {
          console.warn('[zellous] public server join failed', e?.message);
          if (window.ui?.showToast) ui.showToast('Could not join the public server: ' + e?.message, 4000, 'error');
        }
      }
    },
    renderList: () => { /* handled by nostr-servers-ui.js which remains */ }
  };
}
