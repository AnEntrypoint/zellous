// Chat module - text messaging with image display

const chat = {
  messages: [],
  maxMessages: 100,

  // Send text message
  send(content) {
    if (!content?.trim() || !state.ws) return;
    network.send({
      type: 'text_message',
      content: content.trim()
    });
  },

  // Send image
  async sendImage(file, caption = '') {
    if (!file || !state.ws) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      network.send({
        type: 'image_message',
        filename: file.name,
        data: base64,
        caption
      });
    };
    reader.readAsDataURL(file);
  },

  // Handle incoming text message
  handleTextMessage(msg) {
    const chatMsg = {
      id: msg.id,
      type: 'text',
      userId: msg.userId,
      username: msg.username,
      content: msg.content,
      timestamp: msg.timestamp || Date.now(),
      isAuthenticated: msg.isAuthenticated
    };
    this.addMessage(chatMsg);
  },

  // Handle incoming image message
  handleImageMessage(msg) {
    const chatMsg = {
      id: msg.id,
      type: 'image',
      userId: msg.userId,
      username: msg.username,
      content: msg.content, // caption
      timestamp: msg.timestamp || Date.now(),
      metadata: msg.metadata,
      isAuthenticated: msg.isAuthenticated
    };
    this.addMessage(chatMsg);
  },

  // Handle file shared
  handleFileShared(msg) {
    const chatMsg = {
      id: msg.id,
      type: 'file',
      userId: msg.userId,
      username: msg.username,
      content: msg.content, // description
      timestamp: msg.timestamp || Date.now(),
      metadata: msg.metadata,
      isAuthenticated: msg.isAuthenticated
    };
    this.addMessage(chatMsg);
  },

  // Handle message history
  handleHistory(msgs) {
    // Clear existing and add all from history
    this.messages = msgs.map(m => ({
      id: m.id,
      type: m.type || 'text',
      userId: m.userId,
      username: m.username,
      content: m.content,
      timestamp: m.timestamp,
      metadata: m.metadata,
      isAuthenticated: m.isAuthenticated
    }));
    ui.render.chat();
  },

  // Add message to list
  addMessage(msg) {
    this.messages.push(msg);
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }
    ui.render.chat();
  },

  // Format file size
  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  // Get image URL
  getImageUrl(roomId, fileId) {
    return `/api/rooms/${roomId}/files/${fileId}`;
  },

  // Get file download URL
  getFileUrl(roomId, fileId) {
    return `/api/rooms/${roomId}/files/${fileId}`;
  },

  // Check if file is an image
  isImage(mimeType) {
    return mimeType?.startsWith('image/');
  },

  // Create image preview element (Discord style)
  createImagePreview(msg) {
    const url = this.getImageUrl(state.roomId, msg.metadata.fileId);
    return `<div class="msg-image">
      <img src="${url}" alt="${msg.metadata.filename || 'image'}" loading="lazy" onclick="chat.openImage('${url}')">
      ${msg.content ? `<div class="msg-image-caption">${this.escapeHtml(msg.content)}</div>` : ''}
    </div>`;
  },

  // Create file attachment element (Discord style)
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

  // Get file icon based on mime type
  getFileIcon(mimeType) {
    if (!mimeType) return '📄';
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎬';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('zip') || mimeType.includes('tar')) return '📦';
    if (mimeType.includes('text')) return '📝';
    return '📄';
  },

  // Escape HTML
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  // Open image in modal/fullscreen
  openImage(url) {
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `
      <div class="image-modal-content">
        <img src="${url}" alt="Full size image">
        <button class="image-modal-close">&times;</button>
      </div>
    `;
    modal.onclick = (e) => {
      if (e.target === modal || e.target.classList.contains('image-modal-close')) {
        modal.remove();
      }
    };
    document.body.appendChild(modal);
  },

  // Format timestamp
  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },

  // Linkify URLs in text
  linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return this.escapeHtml(text).replace(urlRegex, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }
};

window.chat = chat;
