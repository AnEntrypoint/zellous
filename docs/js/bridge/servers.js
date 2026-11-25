import { trait } from '../modules/registry.js';
const ZELLOUS_PUBLIC_SERVER_ID = '0000000000000000000000000000000000000000000000000000000000000000:public';

export function installServers(ww) {
  const bans = ww.bans;
  const srv = ww.servers;
  srv.addEventListener('storage-error', (e) => { if (window.ui) ui.showToast(e.detail.message || 'Storage full — some data may not be saved', 4000, 'error'); });
  srv.addEventListener('updated', (e) => { state.servers = e.detail.servers; state.deletedServers = srv.deletedIds(); if (window.ui) ui.render.all(); });
  srv.addEventListener('deleted', async (e) => {
    if (e.detail.wasListed && window.ui?.showToast) ui.showToast('"' + e.detail.name + '" was deleted by its owner', 4500, 'error');
    if (!state.currentServerId && state.servers.length && !state.homeMode) await window.serverManager.switchTo(state.servers[0].id);
  });
  srv.addEventListener('switched', (e) => { state.currentServerId = e.detail.serverId; if (window.nostrSelfRoles) window.nostrSelfRoles.subscribe(e.detail.serverId); state.chatMessages = []; state.channelPins = []; state.channels = []; state.categories = []; if (window.ui) ui.render.all(); });
  window.serverManager = {
    loadServers: () => srv.load(),
    create: (n, c) => srv.create(n, c),
    rename: (sid, n, c) => srv.rename(sid, n, c),
    kickFromVoice: (pk) => bans.kickFromVoice(state.currentServerId, pk),
    banUserNostr: (sid, pk) => bans.ban(sid, pk),
    timeoutUserNostr: (sid, pk, min) => bans.timeout(sid, pk, min),
    join: async (sid, opts) => {
      const known = srv.servers.some((x) => x && x.id === sid);
      await srv.join(sid, opts);
      if (!known && window.nostrMembership) window.nostrMembership.announceWhenReady(sid).catch(() => {});
    },
    delete: (sid) => srv.delete(sid),
    deleteForEveryone: (sid, channelIds) => srv.deleteForEveryone(sid, { channelIds }),
    watchTombstone: (sid) => srv.watchTombstone(sid),
    isDeleted: (sid) => srv.isDeleted(sid),
    leave: (sid) => srv.leave(sid),
    switchTo: async (sid) => {
      state.homeMode = false;
      document.getElementById('homeServer')?.classList.remove('active');
      await srv.switchTo(sid);
      const firstText = state.channels?.find(c => trait(c.type, 'defaultOpen'));
      if (firstText && state.currentChannelId !== firstText.id) {
        state.currentChannelId = firstText.id; state.currentChannel = firstText;
        window.chat.loadHistory(firstText.id);
      }
      if (window.ui) ui.render.all();
    },
    init: async () => {
      srv.init();
      if (srv.auth?.pubkey && !srv.servers.find(s => s.id === ZELLOUS_PUBLIC_SERVER_ID)) {
        try {
          await srv.join(ZELLOUS_PUBLIC_SERVER_ID, { name: 'Zellous Public', select: !srv.servers.length });
          state.servers = srv.servers;
          if (window.ui) ui.render.all();
        } catch (e) {
          console.warn('[zellous] public server join failed', e?.message);
          if (window.ui?.showToast) ui.showToast('Could not join the public server: ' + e?.message, 4000, 'error');
        }
      }
    },
    renderList: () => {}
  };
}
