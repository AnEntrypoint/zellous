export function installChannels(ww) {
  const a = ww.auth;
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
