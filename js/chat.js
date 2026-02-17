const chat = {
  maxMessages: 100,

  get messages() { return state.chatMessages || []; },
  set messages(v) { state.chatMessages = v; },

  send(content) {
    if (!content?.trim() || !state.ws) return;
    const trimmed = content.trim();
    this.addMessage({
      id: 'local-' + Date.now() + '-' + Math.random(),
      type: 'text',
      userId: state.userId,
      username: state.currentUser?.displayName || state.currentUser?.username || 'You',
      content: trimmed,
      timestamp: Date.now(),
      isAuthenticated: state.isAuthenticated,
      channelId: state.currentChannel?.id || 'general',
      pending: true
    });
    network.send({ type: 'text_message', content: trimmed, channelId: state.currentChannel?.id || 'general' });
  },

  async sendImage(file, caption = '') {
    if (!file || !state.ws) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      network.send({ type: 'image_message', filename: file.name, data: base64, caption, channelId: state.currentChannel?.id || 'general' });
    };
    reader.readAsDataURL(file);
  },

  handleTextMessage(msg) {
    const msgChannel = msg.channelId || 'general';
    if (msgChannel !== (state.currentChannel?.id || 'general')) return;
    const pendingIdx = this.messages.findIndex(m => 
      m.pending && m.userId === msg.userId && m.content === msg.content
    );
    if (pendingIdx !== -1) {
      this.messages[pendingIdx] = {
        id: msg.id,
        type: 'text',
        userId: msg.userId,
        username: msg.username,
        content: msg.content,
        timestamp: msg.timestamp || Date.now(),
        isAuthenticated: msg.isAuthenticated,
        channelId: msgChannel
      };
      this.messages = [...this.messages];
    } else {
      this.addMessage({
        id: msg.id,
        type: 'text',
        userId: msg.userId,
        username: msg.username,
        content: msg.content,
        timestamp: msg.timestamp || Date.now(),
        isAuthenticated: msg.isAuthenticated,
        channelId: msgChannel
      });
    }
    ui.render.chat();
  },

  handleImageMessage(msg) {
    const msgChannel = msg.channelId || 'general';
    if (msgChannel !== (state.currentChannel?.id || 'general')) return;
    const pendingIdx = this.messages.findIndex(m => 
      m.pending && m.userId === msg.userId && m.content === msg.content
    );
    if (pendingIdx !== -1) {
      this.messages[pendingIdx] = {
        id: msg.id,
        type: 'image',
        userId: msg.userId,
        username: msg.username,
        content: msg.content,
        timestamp: msg.timestamp || Date.now(),
        metadata: msg.metadata,
        isAuthenticated: msg.isAuthenticated,
        channelId: msgChannel
      };
      this.messages = [...this.messages];
    } else {
      this.addMessage({
        id: msg.id,
        type: 'image',
        userId: msg.userId,
        username: msg.username,
        content: msg.content,
        timestamp: msg.timestamp || Date.now(),
        metadata: msg.metadata,
        isAuthenticated: msg.isAuthenticated,
        channelId: msgChannel
      });
    }
    ui.render.chat();
  },

  handleFileShared(msg) {
    const msgChannel = msg.channelId || 'general';
    if (msgChannel !== (state.currentChannel?.id || 'general')) return;
    this.addMessage({
      id: msg.id,
      type: 'file',
      userId: msg.userId,
      username: msg.username,
      content: msg.content,
      timestamp: msg.timestamp || Date.now(),
      metadata: msg.metadata,
      isAuthenticated: msg.isAuthenticated,
      channelId: msgChannel
    });
  },

  handleHistory(msgs, channelId) {
    if (channelId && channelId !== (state.currentChannel?.id || 'general')) return;
    this.messages = msgs.map(m => ({
      id: m.id, type: m.type || 'text', userId: m.userId,
      username: m.username, content: m.content, timestamp: m.timestamp,
      metadata: m.metadata, isAuthenticated: m.isAuthenticated,
      channelId: m.channelId || 'general'
    }));
    ui.render.chat();
  },

  addMessage(msg) {
    const current = [...this.messages];
    if (current.length > this.maxMessages) current.shift();
    current.push(msg);
    this.messages = current;
    ui.render.chat();
  },

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  getImageUrl(roomId, fileId) { return `/api/rooms/${roomId}/files/${fileId}`; },
  getFileUrl(roomId, fileId) { return `/api/rooms/${roomId}/files/${fileId}`; },
  isImage(mimeType) { return mimeType?.startsWith('image/'); },

  createImagePreview(msg) {
    const url = this.getImageUrl(state.roomId, msg.metadata.fileId);
    return `<div class="msg-image">
      <img src="${url}" alt="${msg.metadata.filename || 'image'}" loading="lazy" onclick="chat.openImage('${url}')">
      ${msg.content ? `<div class="msg-image-caption">${this.escapeHtml(msg.content)}</div>` : ''}
    </div>`;
  },

  createFileAttachment(msg) {
    const url = this.getFileUrl(state.roomId, msg.metadata.fileId);
    const icon = this.getFileIcon(msg.metadata.mimeType);
    return `<div class="msg-file">
      <span class="msg-file-icon">${icon}</span>
      <div class="msg-file-info">
        <a href="${url}" download="${msg.metadata.filename}" class="msg-file-name">${this.escapeHtml(msg.metadata.filename)}</a>
        <div class="msg-file-size">${this.formatSize(msg.metadata.size)}</div>
      </div>
    </div>`;
  },

  getFileIcon(mimeType) {
    if (!mimeType) return '\u{1F4C4}';
    if (mimeType.startsWith('image/')) return '\u{1F5BC}';
    if (mimeType.startsWith('video/')) return '\u{1F3AC}';
    if (mimeType.startsWith('audio/')) return '\u{1F3B5}';
    if (mimeType.includes('pdf')) return '\u{1F4D5}';
    if (mimeType.includes('zip') || mimeType.includes('tar')) return '\u{1F4E6}';
    if (mimeType.includes('text')) return '\u{1F4DD}';
    return '\u{1F4C4}';
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  openImage(url) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `<div class="image-modal-content">
        <img src="${url}" alt="Full size image">
        <button class="image-modal-close">&times;</button>
      </div>`;
    modal.onclick = (e) => {
      if (e.target === modal || e.target.classList.contains('image-modal-close')) modal.remove();
    };
    document.body.appendChild(modal);
  },

  linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return this.escapeHtml(text).replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  },

  async deleteMessage(messageId) {
    const res = await fetch(`/api/rooms/${state.roomId}/messages/${messageId}`, {
      method: 'DELETE',
      headers: auth?.getToken ? { Authorization: 'Bearer ' + auth.getToken() } : {}
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error);
    }
    return true;
  },

  async editMessage(messageId, newContent) {
    const res = await fetch(`/api/rooms/${state.roomId}/messages/${messageId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(auth?.getToken ? { Authorization: 'Bearer ' + auth.getToken() } : {})
      },
      body: JSON.stringify({ content: newContent })
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error);
    }
    return true;
  },

  showMessageContextMenu(msg, x, y) {
    chat.hideMessageContextMenu();
    const isOwnMessage = msg.userId === state.userId;
    const menu = document.createElement('div');
    menu.id = 'messageContextMenu';
    menu.className = 'context-menu';
    menu.style.cssText = `position:fixed;top:${y}px;left:${x}px;z-index:2500`;
    
    let items = '';
    if (isOwnMessage) {
      items += `<div class="context-menu-item" data-action="edit">Edit</div>`;
      items += `<div class="context-menu-item danger" data-action="delete">Delete</div>`;
    }
    
    if (!items) return;
    menu.innerHTML = items;
    document.body.appendChild(menu);

    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';

    menu.addEventListener('click', async (e) => {
      const action = e.target.dataset.action;
      chat.hideMessageContextMenu();
      if (action === 'delete') {
        if (confirm('Delete this message?')) {
          try {
            await chat.deleteMessage(msg.id);
          } catch (err) {
            console.warn('[Chat] Delete failed:', err.message);
          }
        }
      } else if (action === 'edit') {
        chat.showEditInput(msg);
      }
    });

    const close = (e) => {
      if (!menu.contains(e.target)) {
        chat.hideMessageContextMenu();
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  },

  hideMessageContextMenu() {
    document.getElementById('messageContextMenu')?.remove();
  },

  showEditInput(msg) {
    const existing = document.getElementById('messageEditInput');
    if (existing) existing.remove();

    const msgEl = document.querySelector(`[data-message-id="${msg.id}"]`);
    if (!msgEl) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'messageEditInput';
    input.className = 'chat-input';
    input.value = msg.content;
    input.style.cssText = 'width:100%;margin-top:4px';

    const container = document.createElement('div');
    container.style.cssText = 'padding:8px;background:#2f3136;border-radius:4px;margin:4px 0';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.className = 'modal-btn';
    saveBtn.style.cssText = 'margin-right:4px';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'modal-btn secondary';

    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'margin-top:4px';
    buttonRow.appendChild(saveBtn);
    buttonRow.appendChild(cancelBtn);

    container.appendChild(input);
    container.appendChild(buttonRow);

    msgEl.querySelector('.msg-content')?.replaceWith(container);
    input.focus();
    input.select();

    const cleanup = () => {
      chat.renderMessage(msg);
      document.removeEventListener('click', handleOutside);
    };

    const handleOutside = (e) => {
      if (!container.contains(e.target)) {
        cleanup();
      }
    };

    saveBtn.addEventListener('click', async () => {
      const newContent = input.value.trim();
      if (newContent && newContent !== msg.content) {
        try {
          await chat.editMessage(msg.id, newContent);
        } catch (err) {
          console.warn('[Chat] Edit failed:', err.message);
        }
      }
      cleanup();
    });

    cancelBtn.addEventListener('click', cleanup);
    setTimeout(() => document.addEventListener('click', handleOutside), 0);
  },

  renderMessage(msg) {
    const isOwn = msg.userId === state.userId;
    const time = formatTime(msg.timestamp);
    const avatarColor = getAvatarColor(msg.userId);
    const initial = (msg.username || '?')[0].toUpperCase();
    const content = msg.type === 'text' ? chat.linkify(msg.content) : chat.escapeHtml(msg.content || '');
    const editedBadge = msg.edited ? '<span class="msg-edited">(edited)</span>' : '';
    const pendingBadge = msg.pending ? '<span class="msg-pending">...</span>' : '';

    let extra = '';
    if (msg.type === 'image' && msg.metadata) {
      extra = chat.createImagePreview(msg);
    } else if (msg.type === 'file' && msg.metadata) {
      extra = chat.createFileAttachment(msg);
    }

    return `<div class="msg" data-message-id="${msg.id}">
      <div class="msg-avatar" style="background:${avatarColor}">${initial}</div>
      <div class="msg-body">
        <div class="msg-header">
          <span class="msg-author">${chat.escapeHtml(msg.username)}</span>
          <span class="msg-timestamp">${time}</span>
          ${pendingBadge}
          ${editedBadge}
        </div>
        <div class="msg-content">${content}</div>
        ${extra}
      </div>
    </div>`;
  }
};
