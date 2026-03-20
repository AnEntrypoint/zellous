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
      html += `<div class="channel-item${isActive ? ' active' : ''}" data-channel="${c.id}" data-type="${c.type}" draggable="true">
        ${icon}
        <span class="channel-name">${escHtml(c.name)}</span>
        <span class="channel-mention-badge" style="display:none"></span>
        <div class="channel-actions">
          <button class="channel-action-btn" data-invite="${c.id}" title="Invite">${window.getIcon ? getIcon('invite') : '✉'}</button>
          <button class="channel-action-btn" data-settings="${c.id}" title="Settings">${window.getIcon ? getIcon('settings') : '⚙'}</button>
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
  },

  renderView() {
    const ch = state.currentChannel;
    if (!ch) return;
    const forumView = document.getElementById('forumView');
    ui.chatArea.style.display = 'none';
    ui.voiceView.style.display = 'none';
    ui.threadedView.style.display = 'none';
    if (forumView) forumView.style.display = 'none';

    const iconMap = { text:'text', voice:'voiceAlt', threaded:'ptt', announcement:'announcement', forum:'forum', thread:'thread' };
    if (ui.chatHeaderIcon) {
      ui.chatHeaderIcon.innerHTML = window.getIcon ? getIcon(iconMap[ch.type]||'text') : ({text:'#',voice:'🔊',threaded:'📋',announcement:'📢',forum:'💬'}[ch.type]||'#');
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
    } else {
      ui.chatArea.style.display = 'flex';
      if (ui.chatInput) ui.chatInput.placeholder = `Message #${ch.name}`;
    }
    if (ui.mobileTitle) ui.mobileTitle.textContent = (ch.type === 'text' ? '# ' : '') + ch.name;
  }
};

window.uiChannels = uiChannels;
