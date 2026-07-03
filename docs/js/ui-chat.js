const formatMessage = (text, selfId) => {
  if (!text) return '';
  const escaped = escHtml(text);
  const codeBlocks = [];
  let out = escaped.replace(/```([\s\S]*?)```/g, (m, code) => {
    codeBlocks.push(code);
    return `CB${codeBlocks.length - 1}`;
  });
  out = out.replace(/`([^`\n]+?)`/g, (m, code) => `<code>${code}</code>`);
  out = out.replace(/\*\*([^\n*]+?)\*\*/g, (m, b) => `<strong>${b}</strong>`);
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, (m, pre, i) => `${pre}<em>${i}</em>`);
  out = out.replace(/@(\w+)/g, (m, name) => {
    const isSelf = state.currentUser && (state.currentUser.username === name || state.currentUser.displayName === name);
    return `<span class="mention${isSelf ? ' self' : ''}">@${name}</span>`;
  });
  out = chat?.linkify ? chat.linkify(out) : out;
  out = out.replace(/CB(\d+)/g, (m, i) => `<pre><code>${codeBlocks[Number(i)]}</code></pre>`);
  return out;
};

const uiChat = {
  messages() {},
  render() {},
  _composerValue: '',
  _sendTimes: [],
  RATE_LIMIT_MAX: 5,
  RATE_LIMIT_WINDOW_MS: 10000,
  _rateLimitRetryAt: 0,
  _checkRateLimit() {
    const now = Date.now();
    if (this._rateLimitRetryAt && now < this._rateLimitRetryAt) {
      const secs = Math.ceil((this._rateLimitRetryAt - now) / 1000);
      if (window.ui?.showToast) ui.showToast(`Sending too fast — try again in ${secs}s`, 2500, 'error');
      return false;
    }
    this._sendTimes = this._sendTimes.filter(t => now - t < this.RATE_LIMIT_WINDOW_MS);
    if (this._sendTimes.length >= this.RATE_LIMIT_MAX) {
      this._rateLimitRetryAt = this._sendTimes[0] + this.RATE_LIMIT_WINDOW_MS;
      const secs = Math.ceil((this._rateLimitRetryAt - now) / 1000);
      if (window.ui?.showToast) ui.showToast(`Sending too fast — try again in ${secs}s`, 2500, 'error');
      return false;
    }
    this._sendTimes.push(now);
    return true;
  },
  _isRateLimited() {
    return !!(this._rateLimitRetryAt && Date.now() < this._rateLimitRetryAt);
  },
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
        disabled: this._isRateLimited(),
        placeholder: this._isRateLimited()
          ? 'Rate limited — please wait…'
          : 'Message ' + (window.stateSignals?.currentChannel?.value?.name ? '#' + window.stateSignals.currentChannel.value.name : '#general'),
        onInput: (v) => { this._composerValue = v; },
        onSend: (v) => {
          if (!this._checkRateLimit()) { render(); return; }
          this._composerValue = ''; this._doSend(v); render();
        }
      }));
    };
    this._renderComposer = render;
    if (this._rateLimitTimer) clearInterval(this._rateLimitTimer);
    this._rateLimitTimer = setInterval(() => { if (this._rateLimitRetryAt) render(); }, 1000);
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
    if (!this._checkRateLimit()) return;
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

};
window.__zellous.uiChat = uiChat;
window.uiChat = uiChat;

if (document.readyState === 'complete') {
  setTimeout(() => uiChat._mountComposer(), 100);
} else {
  window.addEventListener('appready', () => uiChat._mountComposer(), { once: true });
  setTimeout(() => uiChat._mountComposer(), 1500);
}