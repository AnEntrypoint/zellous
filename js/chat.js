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
  },

  handleImageMessage(msg) {
    const msgChannel = msg.channelId || 'general';
    if (msgChannel !== (state.currentChannel?.id || 'general')) return;
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
  }
};

window.chat = chat;
