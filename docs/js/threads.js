const threadManager = {
  _threads: new Map(),

  renderPanel() {},

  listFor(channelId) {
    return this._threads.get(channelId) || [];
  },

  _syncOpenPanel() {
    if (!state.threadPanelOpen) return;
    const parentId = state.currentChannel?.id;
    state.threads = this.listFor(parentId);
  },

  openPanel(channelId) {
    const panel = document.getElementById('threadPanel');
    if (panel) panel.classList.add('open');
    state.threadPanelOpen = true;
    this._syncOpenPanel();
  },

  closePanel() {
    const panel = document.getElementById('threadPanel');
    if (panel) panel.classList.remove('open');
    state.threadPanelOpen = false;
  },

  setThreads(channelId, threads) {
    this._threads.set(channelId, threads);
    this._syncOpenPanel();
    this.renderPanel(channelId);
  },

  addThread(channelId, thread) {
    const existing = this._threads.get(channelId) || [];
    this._threads.set(channelId, [...existing, thread]);
    this._syncOpenPanel();
    this.renderPanel(channelId);
  },

  updateFromChannels() {
    const channels = state.channels || [];
    const threads = channels.filter(c => c.type === 'threaded' && c.parentChannelId);
    threads.forEach(t => {
      const parentId = t.parentChannelId;
      const existing = this._threads.get(parentId) || [];
      if (!existing.find(x => x.id === t.id)) {
        existing.push({ id: t.id, title: t.name, author: t.createdBy || '', time: t.createdAt || Date.now() });
        this._threads.set(parentId, existing);
      }
    });
    this._syncOpenPanel();
    if (document.getElementById('threadPanel')?.classList.contains('open')) {
      this.renderPanel(state.currentChannel?.id);
    }
  },

  async create(parentChannelId, title) {
    if (!window.channelManager || !parentChannelId) return null;
    const parent = (state.channels || []).find(c => c.id === parentChannelId);
    const name = title || `thread-${Date.now().toString(36)}`;
    const before = new Set((state.channels || []).map(c => c.id));
    await window.channelManager.create(name, 'threaded', parent?.categoryId ?? null);
    const created = (state.channels || []).find(c => c.type === 'threaded' && c.name === name && !before.has(c.id));
    if (!created) return null;
    await window.channelManager.update(created.id, { parentChannelId });
    created.parentChannelId = parentChannelId;
    const existing = this._threads.get(parentChannelId) || [];
    existing.push({ id: created.id, title: name, author: state.userId || '', time: Date.now() });
    this._threads.set(parentChannelId, existing);
    this._syncOpenPanel();
    return created;
  },

  select(threadId) {
    const parentId = state.currentChannel?.id;
    const list = this.listFor(parentId);
    const thread = list.find(t => t.id === threadId);
    state.activeThreadId = threadId;
    const ch = (state.channels || []).find(c => c.id === threadId);
    if (ch && window.ui?.actions?.switchChannel) window.ui.actions.switchChannel(ch);
    return thread;
  },

  renderForumPosts() {}
};

window.__zellous.threads = threadManager;
window.threadManager = threadManager;
