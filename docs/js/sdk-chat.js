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

    const ICONS = {
      threads: 'M1.5 4.5C1.5 3.12 2.62 2 4 2h16c1.38 0 2.5 1.12 2.5 2.5v11c0 1.38-1.12 2.5-2.5 2.5H7.31l-3.8 3.81A1 1 0 0 1 2 21V4.5zm2.5 0v13.09l2.43-2.43A1 1 0 0 1 7.14 15H20V4.5H4z',
      queue: 'M4 6h16v2H4zm2 5h12v2H6zm3 5h6v2H9z',
      members: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
      settings: 'M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.02 7.02 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54a7.02 7.02 0 0 0-1.62.94l-2.39-.96a.47.47 0 0 0-.59.22L2.74 9.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.47.47 0 0 0-.12.61l1.92 3.32c.12.22.37.3.59.22l2.39-.96c.5.38 1.04.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54a7.02 7.02 0 0 0 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.47.47 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z',
      search: 'M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z'
    };

    function svgBtn(pathD, title, onClick) {
      return h('button', { class: 'toolbar-btn', title, onclick: onClick },
        h('svg', { viewBox: '0 0 24 24', width: 18, height: 18, fill: 'currentColor' },
          h('path', { d: pathD })
        )
      );
    }

    function buildToolbar() {
      return [
        svgBtn(ICONS.threads, 'Threads', () => {
          if (window.threadsUI?.toggle) window.threadsUI.toggle();
          else document.getElementById('threadsSidebar')?.classList.toggle('open');
        }),
        svgBtn(ICONS.queue, 'Audio Queue', () => window.ui?.actions?.toggleQueue?.()),
        svgBtn(ICONS.members, 'Members', () => window.ui?.actions?.toggleMembers?.()),
        svgBtn(ICONS.settings, 'Channel Settings', () => {
          const ch = state.currentChannel;
          if (ch && window.channelManager?.showContextMenu) window.channelManager.showContextMenu(ch.id, 0, 0);
          else if (typeof window.openSettings === 'function') window.openSettings();
        }),
        svgBtn(ICONS.search, 'Search', () => window.ui?.actions?.toggleSearch?.())
      ];
    }

    function headerView() {
      const ch = state.currentChannel || {};
      const typeIcon = { voice: '🔊', forum: '☷', threaded: '✎', page: '§' }[ch.type] || '#';
      return C.ChatHeader({
        icon: typeIcon,
        name: ch.name || 'general',
        topic: ch.topic || '',
        toolbar: buildToolbar()
      });
    }

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
