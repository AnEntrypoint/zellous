(function () {
  function init() {
    const sdk = window.__sdk;
    const effect = window.__effect;
    if (!sdk || !effect || !sdk.C || !sdk.h || !sdk.applyDiff || !window.chat) {
      setTimeout(init, 30);
      return;
    }
    const headerHost = document.getElementById('chatHeaderBar');
    const areaHost = document.getElementById('chatArea');
    if (!areaHost) return;

    const { h, applyDiff, C } = sdk;

    // Hide legacy chat-header-bar; C.Chat renders its own canonical chat-head
    if (headerHost) headerHost.style.display = 'none';
    areaHost.innerHTML = '';

    const CODE_FENCE_RE = /^```([a-zA-Z0-9_+-]*)\n([\s\S]*?)\n?```\s*$/;

    function partsFromMessage(m) {
      const parts = [];
      if (m.replyTo) {
        const who = m.replyTo.username || 'User';
        const quoted = (m.replyTo.content || '').replace(/\n/g, ' ').slice(0, 120);
        parts.push({ kind: 'md', text: '> **@' + who + ':** ' + quoted });
      }
      const content = m.content || '';
      const fence = content.match(CODE_FENCE_RE);
      if (m.type === 'code' || fence) {
        const lang = fence ? fence[1] : (m.lang || '');
        const code = fence ? fence[2] : content;
        parts.push({ kind: 'code', code, lang });
      } else if (m.type === 'image') {
        const src = m.url || m.imageUrl || m.src;
        if (src) parts.push({ kind: 'image', src, alt: m.alt || '', caption: m.caption });
        else if (content) parts.push({ kind: 'md', text: content });
      } else if (m.type === 'file') {
        const src = m.url || m.fileUrl || m.src;
        parts.push({ kind: 'file', src, name: m.name || m.filename || 'attachment', size: m.size });
      } else if (content) {
        parts.push({ kind: 'md', text: content });
      }
      if (Array.isArray(m.attachments)) {
        for (const a of m.attachments) {
          if (!a) continue;
          if (a.type === 'image' && (a.src || a.url)) parts.push({ kind: 'image', src: a.src || a.url, alt: a.alt || '', caption: a.caption });
          else if ((a.src || a.url) && (a.name || a.filename)) parts.push({ kind: 'file', src: a.src || a.url, name: a.name || a.filename, size: a.size });
        }
      }
      return parts;
    }

    function avatarColor(id) {
      return (window.getAvatarColor && window.getAvatarColor(id)) || 'var(--accent)';
    }

    function mapMessages() {
      const chatMsgs = (window.chat?.messages) || [];
      const sysMsgs = (state.messages || []).map(m => ({
        id: m.id, type: 'system', text: m.text,
        timestamp: typeof m.time === 'number' ? m.time : Date.now()
      }));
      const merged = [...chatMsgs, ...sysMsgs].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      const selfId = state.userId || state.nostrPubkey;
      return merged.map((m, i) => {
        if (m.type === 'system') {
          return { key: m.id || ('sys' + i), who: 'them', name: '', parts: [{ kind: 'md', text: '_' + (m.text || '') + '_' }] };
        }
        const username = (window.chat?.resolveProfile && window.chat.resolveProfile(m.userId)) || m.username || 'User';
        const isYou = selfId && String(m.userId) === String(selfId);
        const time = (typeof window.formatTime === 'function')
          ? window.formatTime(m.timestamp)
          : new Date(m.timestamp || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        const reactions = Array.isArray(m.reactions) ? m.reactions.map(r => ({
          emoji: r.emoji,
          count: r.count != null ? r.count : (r.users ? r.users.length : 1),
          you: !!(r.you || (r.users && selfId && r.users.includes(selfId)))
        })) : null;
        return {
          key: m.id || ('m' + i),
          who: isYou ? 'you' : 'them',
          name: isYou ? null : username,
          avatar: (window.getInitial ? window.getInitial(username) : (username[0] || '?')),
          time,
          parts: partsFromMessage(m),
          reactions,
          receipt: isYou && m.read ? 'read' : (isYou && m.delivered ? 'delivered' : null)
        };
      });
    }

    function composerView() {
      const ch = state.currentChannel;
      const placeholder = 'Message ' + (ch?.name ? '#' + ch.name : '#general');
      return C.ChatComposer({
        value: state.chatInputValue || '',
        placeholder,
        onInput: (v) => { state.chatInputValue = v; },
        onSend: (v) => {
          const text = (v || '').trim();
          if (!text) return;
          state.chatInputValue = '';
          try {
            if (window.ui && window.ui._replyTarget) {
              window.chat.send(text, { replyTo: window.ui._replyTarget });
              window.ui._replyTarget = null;
              document.getElementById('replyComposeBar')?.remove();
            } else {
              window.chat.send(text);
            }
          } catch (e) {}
        }
      });
    }

    function areaView() {
      const ch = state.currentChannel || {};
      const sub = ch.type === 'voice' ? 'voice'
        : ch.type === 'forum' ? 'forum'
        : ch.type === 'page' ? 'page'
        : ch.type === 'announcement' ? 'announcement'
        : 'public';
      return C.Chat({
        title: ch.name || 'general',
        sub,
        messages: mapMessages(),
        header: null,
        composer: composerView()
      });
    }

    function renderArea() { applyDiff(areaHost, areaView()); }

    effect(() => {
      window.stateSignals.chatMessages.value;
      window.stateSignals.messages.value;
      window.stateSignals.chatInputValue.value;
      window.stateSignals.currentChannel.value;
      window.stateSignals.currentUser.value;
      renderArea();
    });

    if (window.uiChat) {
      window.uiChat.render = function () {};
      window.uiChat.messages = function () {};
      window.uiChat._mountComposer = function () {};
    }
  }
  init();
})();
