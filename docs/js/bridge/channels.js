export function installChannels(ww) {
  const a = ww.auth;
  const ch = ww.channels;
  const refreshCurrentChannel = (channels) => {
    if (!state.currentChannel) return;
    const cur = channels.find(c => c.id === state.currentChannel.id);
    if (cur) state.currentChannel = cur;
  };
  ch.addEventListener('updated', (e) => {
    state.channels = e.detail.channels; state.categories = e.detail.categories;
    if (window.ui) ui.render.all();
    if (state.voiceConnected && state.currentChannel && window.__zellous?.voiceMode) {
      const cur = (e.detail.channels || []).find(c => c.id === state.currentChannel.id);
      if (cur) {
        state.currentChannel = cur;
        window.__zellous.voiceMode.apply();
      }
    }
    refreshCurrentChannel(e.detail.channels || []);
  });
  window.channelManager = {
    isOwner: () => a.pubkey && state.currentServerId && a.pubkey === state.currentServerId.split(':')[0],
    loadChannels: (sid, onReady) => ch.load(sid, onReady),
    _setDefaults: () => ch._setDefaults(),
    _publishChannelList: () => ch._publish(),
    create: (n, t, c, x) => ch.create(n, t, c, x),
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
}
