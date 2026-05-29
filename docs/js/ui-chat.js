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
    const announceBtn = document.getElementById('announceBtn');
    if (announceBtn) announceBtn.style.display = (window.serverRoles && state.currentServerId && serverRoles.isAdmin(state.currentServerId)) ? 'inline-flex' : 'none';
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
        html += `<div class="msg-system"><span class="msg-system-icon">-</span>${escHtml(m.text)}</div>`;
        return;
      }
      const sameUser = m.userId === lastUser && (m.timestamp - lastTime) < 420000;
      const time = formatTime(m.timestamp);
      const shortTime = new Date(m.timestamp).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' });
      const username = (chat?.resolveProfile && chat.resolveProfile(m.userId)) || m.username || 'User';
      const color = getAvatarColor(m.userId);
      const isAnnouncement = Array.isArray(m.tags) && m.tags.includes('announcement');
      const pendingAttr = m.pending ? ' style="opacity:0.6"' : '';
      const editedBadge = m.edited ? '<span class="msg-edited">(edited)</span>' : '';
      const selfId = state.userId || state.nostrPubkey;
      const canEdit = selfId && String(m.userId) === String(selfId) && !state.nostrPubkey;
      const canDelete = selfId && String(m.userId) === String(selfId);

      const ic = (k, fb) => window.getIcon ? getIcon(k) : fb;
      const actions = `<div class="msg-actions"><button class="msg-action-btn" data-react="${m.id}" title="Add Reaction">${ic('emoji','react')}</button><button class="msg-action-btn" data-reply="${m.id}" title="Reply">${ic('reply','reply')}</button>${canEdit?`<button class="msg-action-btn" data-edit="${m.id}" title="Edit">${ic('edit','edit')}</button>`:''}<button class="msg-action-btn" data-pin="${m.id}" title="Pin">${ic('pin','pin')}</button>${canDelete?`<button class="msg-action-btn danger" data-delete="${m.id}" title="Delete">${ic('delete','del')}</button>`:''}</div>`;

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

      const annoClass = isAnnouncement ? ' announcement-msg' : '';
      if (!sameUser) {
        html += `<div class="msg-group${annoClass}" data-message-id="${m.id}" data-user-id="${m.userId}"${pendingAttr}>
          ${actions}<div class="msg-avatar" style="background:${color}">${getInitial(username)}</div>
          ${replyHtml}<span class="msg-username" style="color:${color}">${escHtml(username)}</span>
          <span class="msg-timestamp">${time}</span>${editedBadge}${contentHtml}${reactionsHtml}
        </div>`;
      } else {
        html += `<div class="msg-cont${annoClass}" data-message-id="${m.id}" data-user-id="${m.userId}"${pendingAttr}>
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
    el.addEventListener('touchstart', (e) => {
      const row = e.target.closest('[data-message-id]');
      if (!row) return;
      const msgId = row.dataset.messageId;
      const startTime = Date.now();
      const startX = e.touches?.[0]?.clientX;
      const startY = e.touches?.[0]?.clientY;
      let canceled = false;
      const touchmove = (me) => {
        const dx = Math.abs((me.touches?.[0]?.clientX || 0) - (startX || 0));
        const dy = Math.abs((me.touches?.[0]?.clientY || 0) - (startY || 0));
        if (dx > 10 || dy > 10) canceled = true;
      };
      const touchend = () => {
        el.removeEventListener('touchmove', touchmove);
        el.removeEventListener('touchend', touchend);
        if (!canceled && Date.now() - startTime >= 300) {
          const msg = chat?.messages?.find(m => m.id === msgId);
          if (msg) this.showMessageContext(msg, e.touches?.[0]?.clientX, e.touches?.[0]?.clientY);
        }
      };
      el.addEventListener('touchmove', touchmove, { passive: true });
      el.addEventListener('touchend', touchend, { once: true });
    }, { passive: true });
  },
  _composerValue: '',
  _mountComposer() {
    const sdk = window.__sdk;
    if (!sdk?.C?.ChatComposer || !sdk.applyDiff) return;
    const { h, applyDiff, C } = sdk;
    const wrapper = document.querySelector('.chat-input-bar');
    if (!wrapper || wrapper.dataset.sdkComposer) return;
    wrapper.dataset.sdkComposer = '1';
    const render = () => {
      applyDiff(wrapper, C.ChatComposer({
        value: this._composerValue,
        placeholder: 'Message ' + (window.stateSignals?.currentChannel?.value?.name ? '#' + window.stateSignals.currentChannel.value.name : '#general'),
        onInput: (v) => { this._composerValue = v; },
        onSend: (v) => { this._composerValue = ''; this._doSend(v); render(); }
      }));
    };
    this._renderComposer = render;
    render();
  },
  _doSend(content) {
    if (!content) return;
    if (ui._replyTarget) {
      chat.send(content, { replyTo: ui._replyTarget });
      ui._replyTarget = null;
      document.getElementById('replyComposeBar')?.remove();
    } else { chat.send(content); }
  },
  sendChat() {
    const content = ui.chatInput?.value?.trim();
    if (!content) return;
    this._doSend(content);
    if (ui.chatInput) ui.chatInput.value = '';
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
    const _selfId = state.userId || state.nostrPubkey;
    if (!msg || String(msg.userId) !== String(_selfId) || state.nostrPubkey) return;
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
    const rect = anchorBtn.getBoundingClientRect();
    if (window.__emojiPicker) {
      window.__emojiPicker.show(rect.left, rect.top, (emoji) => { chat?.toggleReaction?.(msgId, emoji); });
    }
  },

  showContextMenu(msg, x, y) {
    this.hideContextMenu();
    const _self = state.userId || state.nostrPubkey;
    const isOwn = _self && msg.userId === _self;
    if (!isOwn) return;
    const menu = document.createElement('div');
    menu.id = 'messageContextMenu';
    menu.className = 'context-menu';
    menu.style.cssText = `position:fixed;top:${y}px;left:${x}px;z-index:2500`;
    menu.innerHTML = `${!state.nostrPubkey ? '<div class="context-menu-item" data-action="edit">Edit</div>' : ''}
      <div class="context-menu-item danger" data-action="delete">Delete</div>`;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
    menu.addEventListener('click', async (e) => {
      const action = e.target.dataset.action;
      this.hideContextMenu();
      if (action === 'delete' && confirm('Delete this message?')) { try { await chat.deleteMessage(msg.id); } catch (err) {} }
      else if (action === 'edit') { this.startEdit(msg.id); }
    });
    const close = (e) => {
      if (!menu.contains(e.target)) { this.hideContextMenu(); document.removeEventListener('click', close); }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  },

  hideContextMenu() { document.getElementById('messageContextMenu')?.remove(); },

  showMessageContext(msg, x, y) {
    document.getElementById('messageContextPopup')?.remove();
    const popup = document.createElement('div');
    popup.id = 'messageContextPopup';
    popup.style.cssText = 'position:fixed;z-index:3500;background:var(--bg-2);border-radius:8px;padding:12px;max-width:280px;font-size:12px;line-height:1.4';
    let html = '';
    if (msg.replyTo) {
      html += `<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.05)"><span style="color:var(--text-muted)">Replying to:</span><br><span style="color:var(--accent)">@${escHtml(msg.replyTo.username||'User')}</span><br><span style="color:var(--text-muted);font-size:11px">${escHtml((msg.replyTo.content||'').substring(0,60))}${msg.replyTo.content?.length>60?'...':''}</span></div>`;
    }
    if (msg.reactions?.length) {
      html += `<div style="margin-bottom:8px"><span style="color:var(--text-muted)">Reactions:</span><br><span>${msg.reactions.map(r=>`${r.emoji} <span style="color:var(--text-muted)">${r.users?.length||1}</span>`).join(' ')}</span></div>`;
    }
    if (msg.threadId || msg.replyCount) {
      html += `<div style="margin-bottom:8px"><span style="color:var(--accent)">Thread</span><br><span style="color:var(--text-muted)">${msg.replyCount||1} reply${msg.replyCount!==1?'ies':''}</span></div>`;
    }
    html += `<div style="color:var(--text-muted);font-size:11px">${formatTime(msg.timestamp)}</div>`;
    popup.innerHTML = html;
    document.body.appendChild(popup);
    const rect = popup.getBoundingClientRect();
    if (rect.right > window.innerWidth) popup.style.left = (window.innerWidth - rect.width - 8) + 'px';
    else popup.style.left = ((x||0) - 140) + 'px';
    if (rect.bottom > window.innerHeight) popup.style.top = ((y||0) - rect.height - 8) + 'px';
    else popup.style.top = ((y||0) + 8) + 'px';
    const close = (e) => {
      if (!popup.contains(e.target) && !e.target.closest('[data-message-id]')) {
        document.getElementById('messageContextPopup')?.remove();
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }
};
window.__zellous.uiChat = uiChat;
window.uiChat = uiChat;

if (document.readyState === 'complete') {
  setTimeout(() => uiChat._mountComposer(), 100);
} else {
  window.addEventListener('appready', () => uiChat._mountComposer(), { once: true });
  setTimeout(() => uiChat._mountComposer(), 1500);
}