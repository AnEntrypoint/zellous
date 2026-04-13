const uiChannels = {
  render() {
    if (!ui.channelList) return;
    const channels = state.channels || [];
    const cats = state.categories || [];
    const current = state.currentChannel || { id: 'general' };
    const collapsed = state.collapsedCategories || new Set();
    let html = '';

    const renderCh = (c) => {
      const isActive = current.id === c.id;
      const icon = chIcon(c.type);
      const isVoiceConnected = c.type === 'voice' && state.voiceConnected && state.voiceChannelName === c.name;
      const isVoiceConnecting = c.type === 'voice' && state.voiceConnectionState === 'connecting' && state.voiceChannelName === c.name;
      html += `<div class="channel-item${isActive ? ' active' : ''}${isVoiceConnected ? ' voice-active' : ''}${isVoiceConnecting ? ' voice-connecting' : ''}" data-channel="${c.id}" data-type="${c.type}" draggable="true">
        ${icon}
        ${isVoiceConnecting ? '<span class="voice-spinner" title="Connecting…"></span>' : ''}
        <span class="channel-name">${escHtml(c.name)}</span>
        <span class="channel-mention-badge" style="display:none"></span>
        <div class="channel-actions">
          <button class="channel-action-btn" data-invite="${c.id}" title="Invite">${window.getIcon ? getIcon('invite') : '✉'}</button>
          <button class="channel-action-btn" data-settings="${c.id}" title="Settings">${window.getIcon ? getIcon('settings') : '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.02 7.02 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54a7.02 7.02 0 0 0-1.62.94l-2.39-.96a.47.47 0 0 0-.59.22L2.74 9.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.47.47 0 0 0-.12.61l1.92 3.32c.12.22.37.3.59.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54a7.02 7.02 0 0 0 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.47.47 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/></svg>'}</button>
        </div>
      </div>`;
      if (isVoiceConnected) {
        html += '<div class="voice-users">';
        (state.voiceParticipants || []).forEach(p => {
          const spk = (state.activeSpeakers || new Set()).has(p.identity) ? ' speaking' : '';
          html += `<div class="voice-user${spk}">
            <div class="voice-user-avatar" style="background:${getAvatarColor(p.identity)}">${getInitial(p.identity)}</div>
            <span class="voice-user-name">${escHtml(p.identity)}</span>
          </div>`;
        });
        html += '</div>';
      }
    };

    const sortedCats = [...cats].sort((a, b) => (a.position||0) - (b.position||0));
    sortedCats.forEach(cat => {
      const isCollapsed = collapsed.has(cat.id);
      const catCh = channels.filter(c => c.categoryId === cat.id).sort((a, b) => (a.position||0)-(b.position||0));
      const arrowCls = isCollapsed ? 'collapsed' : '';
      html += `<div class="category-header${isCollapsed ? ' collapsed' : ''}" data-category="${cat.id}">
        <svg class="category-arrow ${arrowCls}" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
        <span class="category-name">${escHtml(cat.name)}</span>
        <button class="category-add-btn" data-category-id="${cat.id}" title="Create Channel">${window.getIcon ? getIcon('add') : '+'}</button>
      </div>`;
      if (!isCollapsed) catCh.forEach(renderCh);
    });

    const uncat = channels.filter(c => !c.categoryId || !cats.find(cat => cat.id === c.categoryId))
      .sort((a, b) => (a.position||0)-(b.position||0));
    if (uncat.length > 0) {
      html += `<div class="category-header" data-category="uncategorized">
        <svg class="category-arrow" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
        <span class="category-name">CHANNELS</span>
        <button class="category-add-btn" data-category-id="uncategorized" title="Create Channel">${window.getIcon ? getIcon('add') : '+'}</button>
      </div>`;
      uncat.forEach(renderCh);
    }

    if (window.serverPages && state.currentServerId) {
      var pages = serverPages.getPages(state.currentServerId);
      var isAdmin = window.serverRoles && serverRoles.isAdmin(state.currentServerId);
      if (pages.length > 0 || isAdmin) {
        html += `<div class="category-header" data-category="pages-section">
          <svg class="category-arrow" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
          <span class="category-name">PAGES</span>
          ${isAdmin ? `<button class="category-add-btn" id="addPageBtn" title="New Page">+</button>` : ''}
        </div>`;
        pages.forEach(function(p) {
          var isCurPage = state.currentChannel && state.currentChannel.id === 'page:' + p.slug && state.currentChannel._serverId === state.currentServerId;
          html += `<div class="channel-item${isCurPage ? ' active' : ''}" data-page-slug="${escHtml(p.slug)}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/></svg>
            <span class="channel-name">${escHtml(p.title)}</span>
          </div>`;
        });
      }
    }

    ui.channelList.innerHTML = html;
    this._bind();
    if (window.channelManager?.initDragAndDrop) channelManager.initDragAndDrop();
    if (window.threadManager?.updateFromChannels) threadManager.updateFromChannels();
  },

  _bind() {
    ui.channelList.querySelectorAll('.category-header').forEach(h => {
      h.addEventListener('click', (e) => {
        if (e.target.closest('.category-add-btn')) return;
        const catId = h.dataset.category;
        if (catId === 'uncategorized') return;
        const col = new Set(state.collapsedCategories || []);
        col.has(catId) ? col.delete(catId) : col.add(catId);
        state.collapsedCategories = col;
        this.render();
      });
      h.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const catId = h.dataset.category;
        if (catId === 'uncategorized') channelManager?.showCreateCategoryModal();
        else channelManager?.showCategoryContextMenu(catId, e.clientX, e.clientY);
      });
    });
    ui.channelList.querySelectorAll('.channel-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.channel-actions')) return;
        const ch = state.channels.find(c => c.id === el.dataset.channel);
        if (ch) ui.actions.switchChannel(ch);
      });
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        channelManager?.showContextMenu(el.dataset.channel, e.clientX, e.clientY);
      });
    });
    ui.channelList.querySelectorAll('.category-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const catId = btn.dataset.categoryId;
        channelManager?.showCreateModal(null, catId === 'uncategorized' ? null : catId);
      });
    });
    ui.channelList.querySelectorAll('[data-settings]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        channelManager?.showContextMenu(btn.dataset.settings, e.clientX, e.clientY);
      });
    });
    ui.channelList.querySelectorAll('[data-invite]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!state.currentServerId) return;
        const url = location.origin + location.pathname + '?room=' + encodeURIComponent(state.currentServerId);
        try { navigator.clipboard.writeText(url); } catch (_) {}
        if (window.ui?.showToast) ui.showToast('Invite link copied!');
      });
    });
    ui.channelList.querySelectorAll('[data-page-slug]').forEach(el => {
      el.addEventListener('click', () => {
        const slug = el.dataset.pageSlug;
        state.currentChannel = { id: 'page:' + slug, name: el.querySelector('.channel-name').textContent, type: 'page', _serverId: state.currentServerId, _slug: slug };
        this.render();
        this.renderView();
      });
    });
    document.getElementById('addPageBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.serverPages) serverPages.showEditModal(state.currentServerId, null);
    });
  },

  renderView() {
    const ch = state.currentChannel;
    if (!ch) return;
    const forumView = document.getElementById('forumView');
    const pageView = document.getElementById('pageView');
    ui.chatArea.style.display = 'none';
    ui.voiceView.style.display = 'none';
    ui.threadedView.style.display = 'none';
    if (forumView) forumView.style.display = 'none';
    if (pageView) pageView.style.display = 'none';

    const iconMap = { text:'text', voice:'voiceAlt', threaded:'ptt', announcement:'announcement', forum:'forum', thread:'thread', page:'text' };
    if (ui.chatHeaderIcon) {
      ui.chatHeaderIcon.innerHTML = window.getIcon ? getIcon(iconMap[ch.type]||'text') : '#';
    }
    ui.chatHeaderName.textContent = ch.name;
    if (ui.chatHeaderTopic) ui.chatHeaderTopic.textContent = ch.topic || '';

    if (ch.type === 'text' || ch.type === 'announcement') {
      ui.chatArea.style.display = 'flex';
      if (ui.chatInput) ui.chatInput.placeholder = `Message #${ch.name}`;
    } else if (ch.type === 'voice') {
      ui.voiceView.style.display = 'flex';
      if (window.uiVoice) { uiVoice.renderGrid(); uiVoice.renderTurnOrder(); }
    } else if (ch.type === 'threaded') {
      ui.threadedView.style.display = 'flex';
    } else if (ch.type === 'forum' && forumView) {
      forumView.style.display = 'flex';
    } else if (ch.type === 'page' && pageView && window.serverPages) {
      pageView.style.display = 'flex';
      serverPages.renderPageView(ch._serverId, ch._slug);
    } else {
      ui.chatArea.style.display = 'flex';
      if (ui.chatInput) ui.chatInput.placeholder = `Message #${ch.name}`;
    }
    if (ui.mobileTitle) ui.mobileTitle.textContent = (ch.type === 'text' ? '# ' : '') + ch.name;
  }
};

window.uiChannels = uiChannels;
