const chat = {
  maxMessages: 100,

  get messages() { return state.chatMessages || []; },
  set messages(v) { state.chatMessages = v; },

  send(content, opts = {}) {
    if (!content?.trim() || !state.ws) return;
    const trimmed = content.trim();
    const channelId = state.currentChannel?.id || 'general';
    const localId = 'local-' + Date.now() + '-' + Math.random();
    const msg = {
      id: localId,
      type: 'text',
      userId: state.userId,
      username: state.currentUser?.displayName || state.currentUser?.username || 'You',
      content: trimmed,
      timestamp: Date.now(),
      isAuthenticated: state.isAuthenticated,
      channelId,
      pending: true,
    };
    if (opts.replyTo) msg.replyTo = opts.replyTo;
    this.addMessage(msg);
    network.send({ type: 'text_message', content: trimmed, channelId, replyTo: opts.replyTo || null });
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

  _confirmMessage(existing, override) {
    return { ...existing, id: override.id, pending: false, username: override.username,
      timestamp: override.timestamp || existing.timestamp,
      isAuthenticated: override.isAuthenticated,
      ...(override.replyTo ? { replyTo: override.replyTo } : {}),
      ...(override.metadata ? { metadata: override.metadata } : {}),
      ...(override.edited ? { edited: true, editedAt: override.editedAt } : {}),
    };
  },

  _resolveOrAdd(msg, type) {
    const msgChannel = msg.channelId || 'general';
    if (msgChannel !== (state.currentChannel?.id || 'general')) return;
    const now = Date.now();
    const pendingIdx = this.messages.findIndex(m =>
      m.pending && m.userId === msg.userId && m.content === msg.content &&
      Math.abs((m.timestamp || now) - (msg.timestamp || now)) < 10000
    );
    if (pendingIdx !== -1) {
      const updated = [...this.messages];
      updated[pendingIdx] = this._confirmMessage(updated[pendingIdx], { ...msg, type });
      this.messages = updated;
    } else {
      const existing = this.messages.find(m => m.id === msg.id);
      if (!existing) {
        this.addMessage({ id: msg.id, type, userId: msg.userId, username: msg.username,
          content: msg.content, timestamp: msg.timestamp || Date.now(),
          metadata: msg.metadata, isAuthenticated: msg.isAuthenticated,
          channelId: msgChannel, replyTo: msg.replyTo || null });
      }
    }
    ui.render.chat();
  },

  handleTextMessage(msg) { this._resolveOrAdd(msg, 'text'); },
  handleImageMessage(msg) { this._resolveOrAdd(msg, 'image'); },

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
    const serverIds = new Set(msgs.map(m => m.id));
    const retained = this.messages.filter(m => !m.pending && !serverIds.has(m.id));
    const incoming = msgs.map(m => ({
      id: m.id, type: m.type || 'text', userId: m.userId,
      username: m.username, content: m.content, timestamp: m.timestamp,
      metadata: m.metadata, isAuthenticated: m.isAuthenticated,
      channelId: m.channelId || 'general',
      replyTo: m.replyTo || null,
      edited: m.edited || false, editedAt: m.editedAt,
      reactions: m.reactions || []
    }));
    this.messages = [...retained, ...incoming].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
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

  getFileUrl(roomId, fileId) { return `/api/rooms/${roomId}/files/${fileId}`; },
  getImageUrl(roomId, fileId) { return chat.getFileUrl(roomId, fileId); },
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

  getFileIcon(t) {
    if (!t) return '\u{1F4C4}';
    if (t.startsWith('image/')) return '\u{1F5BC}';
    if (t.startsWith('video/')) return '\u{1F3AC}';
    if (t.startsWith('audio/')) return '\u{1F3B5}';
    if (t.includes('pdf')) return '\u{1F4D5}';
    if (t.includes('zip') || t.includes('tar')) return '\u{1F4E6}';
    if (t.includes('text')) return '\u{1F4DD}';
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
    modal.innerHTML = `<div class="image-modal-content"><img src="${url}" alt="Full size image"><button class="image-modal-close">&times;</button></div>`;
    modal.onclick = (e) => { if (e.target === modal || e.target.classList.contains('image-modal-close')) modal.remove(); };
    document.body.appendChild(modal);
  },

  linkify(text) {
    const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
    return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(url)}</a>`);
  },

  _authHeaders(json) {
    const h = auth?.getToken ? { Authorization: 'Bearer ' + auth.getToken() } : {};
    return json ? { ...h, 'Content-Type': 'application/json' } : h;
  },

  async deleteMessage(id) {
    const r = await fetch(`/api/rooms/${state.roomId}/messages/${id}`, { method: 'DELETE', headers: this._authHeaders() });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
    return true;
  },

  async editMessage(id, content) {
    const r = await fetch(`/api/rooms/${state.roomId}/messages/${id}`, { method: 'PATCH', headers: this._authHeaders(true), body: JSON.stringify({ content }) });
    if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
    return true;
  },

};
