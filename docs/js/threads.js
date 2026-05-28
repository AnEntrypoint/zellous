const threadManager = {
  _threads: new Map(),

  renderPanel() {},

  openPanel(channelId) {
    const panel = document.getElementById('threadPanel');
    if (!panel) return;
    panel.classList.add('open');
  },

  setThreads(channelId, threads) {
    this._threads.set(channelId, threads);
    if (document.getElementById('threadPanel')?.classList.contains('open')) {
      this.renderPanel(channelId);
    }
  },

  addThread(channelId, thread) {
    const existing = this._threads.get(channelId) || [];
    this._threads.set(channelId, [...existing, thread]);
    this.renderPanel(channelId);
  },

  updateFromChannels() {
    const channels = state.channels || [];
    const threads = channels.filter(c => c.type === 'thread');
    threads.forEach(t => {
      const parentId = t.parentChannelId;
      if (parentId) {
        const existing = this._threads.get(parentId) || [];
        if (!existing.find(x => x.id === t.id)) {
          existing.push(t);
          this._threads.set(parentId, existing);
        }
      }
    });
    if (document.getElementById('threadPanel')?.classList.contains('open')) {
      this.renderPanel(state.currentChannel?.id);
    }
  },

  renderForumPosts() {}
};

window.__zellous.threads = threadManager;
window.threadManager = threadManager;
