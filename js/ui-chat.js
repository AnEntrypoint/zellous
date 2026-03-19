const mentionify = (text, selfId) => {
  if (!text) return '';
  return escHtml(text).replace(/@(\w+)/g, (m, name) => {
    const isSelf = state.currentUser && (state.currentUser.username === name || state.currentUser.displayName === name);
    return `<span class="mention${isSelf ? ' self' : ''}">@${escHtml(name)}</span>`;
  });
};

const uiChat = {
  messages() { this.render(); },

  render() {
    if (!ui.chatMessagesInner) return;
    const chatMsgs = chat?.messages || [];
    const sysMsgs = (state.messages || []).map(m => ({
      id: m.id, type: 'system', text: m.text,
      timestamp: typeof m.time === 'number' ? m.time : Date.now(),
    }));
    const merged = [...chatMsgs, ...sysMsgs].sort((a, b) => (a.timestamp||0) - (b.timestamp||0));
    if (!merged.length) {
      ui.chatMessagesInner.innerHTML = '<div class="empty-state">No messages yet. Be the first to say something!</div>';
      return;
    }
    const scrollPos = ui.chatMessages.scrollHeight - ui.chatMessages.scrollTop - ui.chatMessages.clientHeight;
    const wasAtBottom = scrollPos < 100 || ui.chatMessages.scrollHeight === 0;
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

      const ic = (k, fb) => window.getIcon ? getIcon(k) : fb;
      const actions = `<div class="msg-actions"><button class="msg-action-btn" data-react="${m.id}" title="Add Reaction">😊</button><button class="msg-action-btn" data-reply="${m.id}" title="Reply">${ic('reply','↩')}</button>${canEdit?`<button class="msg-action-btn" data-edit="${m.id}" title="Edit">${ic('edit','✏')}</button>`:''}<button class="msg-action-btn" data-pin="${m.id}" title="Pin">${ic('pin','📌')}</button>${canEdit?`<button class="msg-action-btn danger" data-delete="${m.id}" title="Delete">${ic('delete','🗑')}</button>`:''}</div>`;

      const replyHtml = m.replyTo ? `<div class="msg-reply-bar"><div class="msg-reply-avatar" style="background:${getAvatarColor(m.replyTo.userId)}">${getInitial(m.replyTo.username||'')}</div><span class="msg-reply-name" style="color:${getAvatarColor(m.replyTo.userId)}">@${escHtml(m.replyTo.username||'User')}</span><span class="msg-reply-content">${escHtml((m.replyTo.content||'').substring(0,80))}</span></div>` : '';

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
    const el = ui.chatMessagesInner;
    el.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('[data-message-id]');
      if (!row) return;
      e.preventDefault();
      const msg = chat?.messages?.find(m => m.id === row.dataset.messageId);
      if (msg) this.showContextMenu(msg, e.clientX, e.clientY);
    });
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.stopPropagation();
      if (btn.dataset.reply) this.startReply(btn.dataset.reply);
      else if (btn.dataset.edit) this.startEdit(btn.dataset.edit);
      else if (btn.dataset.delete) chat?.deleteMessage(btn.dataset.delete);
      else if (btn.dataset.react) this.showEmojiPicker(btn.dataset.react, btn);
      else if (btn.dataset.reactEmoji) chat?.toggleReaction?.(btn.dataset.msg, btn.dataset.reactEmoji);
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
    picker.addEventListener('click', (e) => { const b = e.target.closest('[data-emoji]'); if (b) { chat?.toggleReaction?.(msgId, b.dataset.emoji); picker.remove(); } });
    setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 0);
  },

  showContextMenu(msg, x, y) {
    this.hideContextMenu();
    const isOwn = msg.userId === state.userId || (state.nostrPubkey && msg.userId === state.nostrPubkey);
    if (!isOwn) return;
    const menu = document.createElement('div');
    menu.id = 'messageContextMenu';
    menu.className = 'context-menu';
    menu.style.cssText = `position:fixed;top:${y}px;left:${x}px;z-index:2500`;
    menu.innerHTML = `<div class="context-menu-item" data-action="edit">Edit</div>
      <div class="context-menu-item danger" data-action="delete">Delete</div>`;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
    menu.addEventListener('click', async (e) => {
      const action = e.target.dataset.action;
      this.hideContextMenu();
      if (action === 'delete' && confirm('Delete this message?')) {
        try { await chat.deleteMessage(msg.id); } catch (err) {}
      } else if (action === 'edit') {
        this.startEdit(msg.id);
      }
    });
    const close = (e) => {
      if (!menu.contains(e.target)) { this.hideContextMenu(); document.removeEventListener('click', close); }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  },

  hideContextMenu() { document.getElementById('messageContextMenu')?.remove(); }
};

window.uiChat = uiChat;
