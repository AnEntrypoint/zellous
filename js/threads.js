const threadManager = {
  _threads: new Map(),

  renderPanel(channelId) {
    const listEl = document.getElementById('threadList');
    if (!listEl) return;
    const threads = this._threads.get(channelId) || [];
    if (!threads.length) {
      listEl.innerHTML = '<div class="empty-state">No threads in this channel yet</div>';
      return;
    }
    listEl.innerHTML = threads.map(t => {
      const isActive = state.currentChannel?.id === t.id;
      const time = t.lastActivity ? new Date(t.lastActivity).toLocaleDateString() : '';
      return `<div class="thread-item${isActive ? ' active' : ''}" data-thread="${t.id}">
        <div class="thread-item-header">
          <span class="thread-item-icon">${window.getIcon ? getIcon('thread') : '🧵'}</span>
          <span class="thread-item-name">${escHtml(t.name)}</span>
        </div>
        <div class="thread-item-preview">${escHtml((t.lastMessage || '').substring(0, 60))}</div>
        <div class="thread-item-meta">
          <span>${t.messageCount || 0} messages</span>
          ${time ? `<span>${time}</span>` : ''}
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.thread-item').forEach(el => {
      el.addEventListener('click', () => {
        const ch = state.channels.find(c => c.id === el.dataset.thread);
        if (ch) ui.actions.switchChannel(ch);
      });
    });
  },

  openPanel(channelId) {
    const panel = document.getElementById('threadPanel');
    if (!panel) return;
    panel.classList.add('open');
    this.renderPanel(channelId || state.currentChannel?.id);
    document.getElementById('createThreadBtn')?.addEventListener('click', () => {
      if (window.channelManager) channelManager.showCreateModal('thread', state.currentChannel?.categoryId || null);
    }, { once: true });
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

  renderForumPosts(channelId) {
    const postsEl = document.getElementById('forumPosts');
    if (!postsEl) return;
    const threads = this._threads.get(channelId) || [];
    if (!threads.length) {
      postsEl.innerHTML = '<div class="empty-state">No posts yet. Be the first to start a discussion!</div>';
      return;
    }
    postsEl.innerHTML = threads.map(t => {
      const time = t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '';
      const author = t.authorName || 'Unknown';
      return `<div class="forum-post-card" data-post="${t.id}">
        <div class="forum-post-title">${escHtml(t.name)}</div>
        <div class="forum-post-meta">
          <span>${escHtml(author)}</span>
          ${time ? `<span>${time}</span>` : ''}
          <span>${t.messageCount || 0} replies</span>
        </div>
        ${t.lastMessage ? `<div class="forum-post-preview">${escHtml(t.lastMessage)}</div>` : ''}
      </div>`;
    }).join('');

    postsEl.querySelectorAll('.forum-post-card').forEach(el => {
      el.addEventListener('click', () => {
        const ch = state.channels.find(c => c.id === el.dataset.post);
        if (ch) ui.actions.switchChannel(ch);
      });
    });
  }
};

document.getElementById('forumNewPostBtn')?.addEventListener('click', () => {
  const ch = state.currentChannel;
  if (ch && window.channelManager) channelManager.showCreateModal('thread', ch.categoryId || null);
});

window.threadManager = threadManager;
