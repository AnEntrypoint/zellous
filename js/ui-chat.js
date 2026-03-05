const mentionify = (text, selfId) => {
  if (!text) return '';
  return escHtml(text).replace(/@(\w+)/g, (m, name) => {
    const isSelf = state.currentUser && (state.currentUser.username === name || state.currentUser.displayName === name);
    return `<span class="mention${isSelf ? ' self' : ''}">@${escHtml(name)}</span>`;
  });
};

const uiChat = {
  messages() {
    if (!ui.chatMessagesInner) return;
    const sysMessages = state.messages || [];
    if (!sysMessages.length || (chat?.messages||[]).length > 0) return;
    ui.chatMessagesInner.innerHTML = sysMessages.map(m =>
      `<div class="msg-system"><span class="msg-system-icon">→</span>${escHtml(m.text)} <span class="msg-timestamp">${m.time}</span></div>`
    ).join('');
    ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
  },

  render() {
    if (!ui.chatMessagesInner) return;
    const chatMsgs = chat?.messages || [];
    const sysMsgs = (state.messages || []).map(m => ({
      id: m.id, type: 'system', text: m.text,
      timestamp: new Date(m.time || Date.now()).getTime() || Date.now(),
    }));
    const merged = [...chatMsgs, ...sysMsgs].sort((a, b) => (a.timestamp||0) - (b.timestamp||0));
    if (!merged.length) {
      ui.chatMessagesInner.innerHTML = '<div class="empty-state">No messages yet. Be the first to say something!</div>';
      return;
    }
    const wasAtBottom = ui.chatMessages.scrollHeight - ui.chatMessages.scrollTop - ui.chatMessages.clientHeight < 80;
    let html = '', lastUser = null, lastTime = 0;

    merged.forEach(m => {
      if (m.type === 'system') {
        lastUser = null; lastTime = 0;
        html += `<div class="msg-system"><span class="msg-system-icon">→</span>${escHtml(m.text)}</div>`;
        return;
      }
      const sameUser = m.userId === lastUser && (m.timestamp - lastTime) < 420000;
      const time = formatTime(m.timestamp);
      const shortTime = new Date(m.timestamp).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
      const username = m.username || 'User';
      const color = getAvatarColor(m.userId);
      const pendingAttr = m.pending ? ' style="opacity:0.6"' : '';
      const editedBadge = m.edited ? '<span class="msg-edited">(edited)</span>' : '';
      const canEdit = String(m.userId) === String(state.userId);

      const actions = `<div class="msg-actions">
        <button class="msg-action-btn" data-react="${m.id}" title="Add Reaction">😊</button>
        <button class="msg-action-btn" data-reply="${m.id}" title="Reply">${window.getIcon ? getIcon('reply') : '↩'}</button>
        ${canEdit ? `<button class="msg-action-btn" data-edit="${m.id}" title="Edit">${window.getIcon ? getIcon('edit') : '✏'}</button>` : ''}
        <button class="msg-action-btn" data-pin="${m.id}" title="Pin">${window.getIcon ? getIcon('pin') : '📌'}</button>
        ${canEdit ? `<button class="msg-action-btn danger" data-delete="${m.id}" title="Delete">${window.getIcon ? getIcon('delete') : '🗑'}</button>` : ''}
      </div>`;

      const replyHtml = m.replyTo ? `<div class="msg-reply-bar">
        <div class="msg-reply-avatar" style="background:${getAvatarColor(m.replyTo.userId)}">${getInitial(m.replyTo.username||'')}</div>
        <span class="msg-reply-name" style="color:${getAvatarColor(m.replyTo.userId)}">@${escHtml(m.replyTo.username||'User')}</span>
        <span class="msg-reply-content">${escHtml((m.replyTo.content||'').substring(0,80))}</span>
      </div>` : '';

      let contentHtml = '';
      if (m.type === 'image') contentHtml = chat?.createImagePreview ? chat.createImagePreview(m) : '';
      else if (m.type === 'file') contentHtml = chat?.createFileAttachment ? chat.createFileAttachment(m) : '';
      else {
        const body = chat?.linkify ? chat.linkify(mentionify(m.content||'', state.userId)) : mentionify(m.content||'', state.userId);
        contentHtml = `<div class="msg-content">${body}</div>`;
      }

      const reactionsHtml = m.reactions?.length ? `<div class="msg-reactions">${m.reactions.map(r =>
        `<button class="reaction-pill${r.users?.includes(state.userId) ? ' reacted' : ''}" data-react-emoji="${r.emoji}" data-msg="${m.id}">${r.emoji} <span class="reaction-count">${r.users?.length||1}</span></button>`
      ).join('')}</div>` : '';

      if (!sameUser) {
        html += `<div class="msg-group" data-message-id="${m.id}" data-user-id="${m.userId}"${pendingAttr}>
          ${actions}<div class="msg-avatar" style="background:${color}">${getInitial(username)}</div>
          ${replyHtml}<span class="msg-username" style="color:${color}">${escHtml(username)}</span>
          <span class="msg-timestamp">${time}</span>${editedBadge}${contentHtml}${reactionsHtml}
        </div>`;
      } else {
        html += `<div class="msg-cont" data-message-id="${m.id}" data-user-id="${m.userId}"${pendingAttr}>
          ${actions}<span class="msg-hover-time">${shortTime}</span>${replyHtml}${contentHtml}${reactionsHtml}
        </div>`;
      }
      lastUser = m.userId; lastTime = m.timestamp;
    });

    ui.chatMessagesInner.innerHTML = html;
    if (wasAtBottom) ui.chatMessages.scrollTop = ui.chatMessages.scrollHeight;
    this._bindActions();
  },

  _bindActions() {
    ui.chatMessagesInner.querySelectorAll('[data-message-id]').forEach(el => {
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const msg = chat?.messages?.find(m => m.id === el.dataset.messageId);
        if (msg) chat.showMessageContextMenu(msg, e.clientX, e.clientY);
      });
    });
    ui.chatMessagesInner.querySelectorAll('[data-reply]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.startReply(btn.dataset.reply); });
    });
    ui.chatMessagesInner.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.startEdit(btn.dataset.edit); });
    });
    ui.chatMessagesInner.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); chat?.deleteMessage(btn.dataset.delete); });
    });
    ui.chatMessagesInner.querySelectorAll('[data-react]').forEach(btn => {
      btn.addEventListener('click', (e) => { e.stopPropagation(); this.showEmojiPicker(btn.dataset.react, btn); });
    });
    ui.chatMessagesInner.querySelectorAll('.reaction-pill').forEach(pill => {
      pill.addEventListener('click', (e) => { e.stopPropagation(); chat?.toggleReaction?.(pill.dataset.msg, pill.dataset.reactEmoji); });
    });
  },

  sendChat() {
    const content = ui.chatInput?.value?.trim();
    if (!content) return;
    if (ui._replyTarget) {
      chat.send(content, { replyTo: ui._replyTarget });
      ui._replyTarget = null;
      document.getElementById('replyComposeBar')?.remove();
    } else { chat.send(content); }
    ui.chatInput.value = '';
  },

  startReply(msgId) {
    const msg = chat?.messages?.find(m => m.id === msgId);
    if (!msg) return;
    ui._replyTarget = { id: msgId, userId: msg.userId, username: msg.username, content: msg.content };
    document.getElementById('replyComposeBar')?.remove();
    const bar = document.createElement('div');
    bar.id = 'replyComposeBar';
    bar.className = 'reply-compose-bar';
    bar.innerHTML = `Replying to <span class="reply-compose-name">@${escHtml(msg.username||'User')}</span>
      <button class="reply-compose-close" id="cancelReplyBtn">✕</button>`;
    const wrapper = document.querySelector('.chat-input-wrapper');
    if (wrapper) wrapper.insertBefore(bar, wrapper.firstChild);
    document.getElementById('cancelReplyBtn')?.addEventListener('click', () => { ui._replyTarget = null; bar.remove(); });
    ui.chatInput?.focus();
  },

  startEdit(msgId) {
    const msg = chat?.messages?.find(m => m.id === msgId);
    if (!msg || String(msg.userId) !== String(state.userId)) return;
    const el = ui.chatMessagesInner?.querySelector(`[data-message-id="${msgId}"]`);
    const content = el?.querySelector('.msg-content');
    if (!content) return;
    const orig = msg.content || '';
    content.innerHTML = `<textarea class="msg-edit-input" id="editInput_${msgId}">${escHtml(orig)}</textarea>
      <div class="msg-edit-hint">escape to <a id="cancelEdit_${msgId}" style="cursor:pointer">cancel</a> · enter to save</div>`;
    const ta = document.getElementById(`editInput_${msgId}`);
    if (ta) {
      ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
      ta.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { this.render(); return; }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const newContent = ta.value.trim();
          if (newContent && newContent !== orig) chat.editMessage(msgId, newContent);
          else this.render();
        }
      });
    }
    document.getElementById(`cancelEdit_${msgId}`)?.addEventListener('click', () => this.render());
  },

  showEmojiPicker(msgId, anchorBtn) {
    document.getElementById('emojiPicker')?.remove();
    const emojis = ['👍','❤️','😂','🎉','😮','😢','😡','🔥','✅','👀'];
    const picker = document.createElement('div');
    picker.id = 'emojiPicker';
    picker.style.cssText = 'position:fixed;z-index:3000;background:var(--bg-floating);border-radius:var(--radius-md);padding:8px;display:flex;gap:4px;box-shadow:var(--elevation-high);';
    picker.innerHTML = emojis.map(e => `<button style="background:transparent;border:none;font-size:20px;cursor:pointer;border-radius:4px;padding:4px" data-emoji="${e}">${e}</button>`).join('');
    const rect = anchorBtn.getBoundingClientRect();
    picker.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    picker.style.left = rect.left + 'px';
    document.body.appendChild(picker);
    picker.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      chat?.toggleReaction?.(msgId, b.dataset.emoji); picker.remove();
    }));
    setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 0);
  }
};

window.uiChat = uiChat;
