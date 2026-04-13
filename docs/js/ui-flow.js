/**
 * Flow UI Controller
 * Adapts Zellous logic to the new Flow layout
 */

const flowUI = {
  _currentView: 'chat', // 'chat' or 'voice'

  init() {
    this.bindTopBar();
    this.bindChat();
    this.bindVoice();
    this.bindMessages();
    console.log('✓ Flow UI initialized');
  },

  bindTopBar() {
    const cmd = document.getElementById('commandPalette');
    if (cmd) {
      cmd.addEventListener('focus', () => {
        // Show command palette overlay
        console.log('Command palette focused');
      });
      cmd.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = cmd.value.trim();
          if (val.startsWith('#')) {
            // Switch channel
            console.log('Switch to channel:', val);
          } else if (val.startsWith('@')) {
            // Open DM
            console.log('Open DM:', val);
          }
          cmd.value = '';
        }
      });
    }

    document.getElementById('serverSelector')?.addEventListener('click', () => {
      console.log('Open server selector');
    });

    document.getElementById('userMenuBtn')?.addEventListener('click', () => {
      if (window.auth?.showModal) auth.showModal();
    });
  },

  bindChat() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    sendBtn?.addEventListener('click', () => this.sendMessage());

    document.getElementById('attachBtn')?.addEventListener('click', () => {
      // Trigger file upload
      const fileInput = document.getElementById('fileInput') || document.createElement('input');
      fileInput.type = 'file';
      fileInput.multiple = true;
      fileInput.addEventListener('change', async (e) => {
        for (const file of e.target.files) {
          try {
            if (window.nostrMedia?.sendMedia) {
              await window.nostrMedia.sendMedia(file);
            }
          } catch (err) {
            console.error('Upload failed:', err);
          }
        }
      });
      fileInput.click();
    });
  },

  sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;

    if (window.chat?.send) {
      chat.send(msg);
      input.value = '';
      input.focus();
    }
  },

  renderMessages(messages) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    const html = messages.map(m => `
      <div class="message" data-id="${m.id}">
        <div class="message-avatar">${m.avatar || m.username[0].toUpperCase()}</div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-author">${m.username}</span>
            <span class="message-time">${this.formatTime(m.timestamp)}</span>
            ${m.edited ? '<span class="message-badge">edited</span>' : ''}
          </div>
          <div class="message-text">${m.content}</div>
          ${m.reactions?.length ? `<div style="margin-top:6px;display:flex;gap:4px;">${m.reactions.map(r => `<span style="font-size:12px;">${r.emoji} ${r.count}</span>`).join('')}</div>` : ''}
        </div>
        <div class="message-actions">
          <button class="action-btn" data-react="${m.id}">👍</button>
          <button class="action-btn" data-reply="${m.id}">↩️</button>
          <button class="action-btn" data-more="${m.id}">⋯</button>
        </div>
      </div>
    `).join('');

    container.innerHTML = html || '<div style="text-align:center;color:var(--text-faint);padding:40px;">No messages</div>';

    // Bind actions
    container.querySelectorAll('[data-react]').forEach(btn => {
      btn.addEventListener('click', () => {
        console.log('React to', btn.dataset.react);
      });
    });

    container.querySelectorAll('[data-reply]').forEach(btn => {
      btn.addEventListener('click', () => {
        console.log('Reply to', btn.dataset.reply);
      });
    });
  },

  bindMessages() {
    if (window.__effect && window.state) {
      window.__effect(() => {
        const msgs = window.state.currentChannelMessages?.value || [];
        this.renderMessages(msgs);
      });
      window.__effect(() => {
        const ch = window.state.currentChannel?.value;
        const name = document.getElementById('chatHeaderName');
        if (name && ch) name.textContent = (ch.type === 'voice' ? '🎤 ' : '# ') + ch.name;
      });
    }
  },

  bindVoice() {
    document.getElementById('voiceMicBtn')?.addEventListener('click', () => {
      if (window.lk?.toggleMic) lk.toggleMic();
    });

    document.getElementById('voiceDeafenBtn')?.addEventListener('click', () => {
      if (window.lk?.toggleDeafen) lk.toggleDeafen();
    });

    document.getElementById('voiceCamBtn')?.addEventListener('click', () => {
      if (window.lk?.toggleCamera) lk.toggleCamera();
    });

    document.getElementById('voiceLeaveBtn')?.addEventListener('click', () => {
      if (window.lk?.disconnect) lk.disconnect();
      this.switchView('chat');
    });

    document.getElementById('voiceSettingsBtn')?.addEventListener('click', () => {
      if (window.ui?.actions?.toggleSettings) ui.actions.toggleSettings();
    });

    if (window.__effect && window.state) {
      window.__effect(() => {
        const connected = window.state.voiceConnected?.value;
        const status = document.getElementById('voiceStatus');
        if (!status) return;
        if (connected) {
          status.classList.add('active');
          status.innerHTML = '<div class="voice-status-dot" style="background:#22c55e;"></div><span>In voice</span>';
          this.switchView('voice');
        } else {
          status.classList.remove('active');
          status.innerHTML = '<div class="voice-status-dot"></div><span>Offline</span>';
          this.switchView('chat');
        }
      });
    }
  },

  switchView(view) {
    const chatView = document.getElementById('chatView');
    const voiceView = document.getElementById('voiceView');

    if (view === 'voice') {
      if (chatView) chatView.style.display = 'none';
      if (voiceView) voiceView.style.display = 'flex';
      this._currentView = 'voice';
    } else {
      if (chatView) chatView.style.display = 'flex';
      if (voiceView) voiceView.style.display = 'none';
      this._currentView = 'chat';
    }
  },

  formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },

  updateVoiceStatus(connected) {
    const status = document.getElementById('voiceStatus');
    if (!status) return;

    if (connected) {
      status.classList.add('active');
      status.innerHTML = '<div class="voice-status-dot"></div><span>In voice</span>';
    } else {
      status.classList.remove('active');
      status.innerHTML = '<div class="voice-status-dot"></div><span>Offline</span>';
    }
  }
};

window.__zellous.flowUI = flowUI;

// Auto-init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => flowUI.init());
} else {
  flowUI.init();
}
