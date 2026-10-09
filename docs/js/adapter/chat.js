import { composerLock, LOCK_DM, resolveAuthor } from './frame.js';

export function buildChat({ v, S, call }) {
  return {
    snapshot(f) {
      const { dm, curr, pageData, lock } = f;
      return {
        pageHtml: pageData ? pageData.html : '',
        pageAuthor: pageData && pageData.author
          ? ((window.chat && window.chat.resolveProfile(pageData.author)) || (window.auth && window.auth.npubShort(pageData.author)) || '')
          : '',
        pageUpdatedAt: pageData ? pageData.updatedAt : 0,
        composerLockedReason: lock ? lock.reason : '',
        messages: (dm ? dm.messages : ((window.chat && window.chat.messages) || v('chatMessages', []))).map((m) => {
          const rx = window.nostrReactions && m.id ? window.nostrReactions.getFor(m.id) : [];
          return rx.length ? { ...m, reactions: rx.map((r) => ({ emoji: r.content, count: r.count, you: r.mine })) } : m;
        }),
        chatInputValue: v('chatInputValue', ''),
        replyTarget: v('replyTarget', null),
        threadPanelOpen: v('threadPanelOpen', false),
        activeThreadId: v('activeThreadId', null),
        threads: v('threads', []),
        forumPosts: (curr && curr.type === 'forum' && window.nostrForum)
          ? window.nostrForum.listFor(curr.id).map((p) => ({ ...p, author: resolveAuthor(p.author) }))
          : [],
        resolveAuthor,
      };
    },
    actions: {
      send: (text, opts) => call(() => {
        if (window.state.homeMode) {
          const peer = v('activeDmPeer', null);
          if (!peer) { window.ui.showToast(LOCK_DM.toast, 3500, 'error'); return; }
          window.dm.send(peer, text).then(() => { if (S.chatInputValue) S.chatInputValue.value = ''; }, (e) => window.ui.showToast('Could not send: ' + (e && e.message || 'unknown'), 4000, 'error'));
          return;
        }
        return Promise.resolve(window.chat.send(text, opts)).then(() => { if (S.replyTarget) S.replyTarget.value = null; if (S.chatInputValue) S.chatInputValue.value = ''; else if (window.state) window.state.chatInputValue = ''; }); }),
      setInput: (val) => { if (S.chatInputValue) S.chatInputValue.value = val; else if (window.state) window.state.chatInputValue = val; },
      startReply: (msg) => call(() => { if (S.replyTarget) S.replyTarget.value = msg; }),
      cancelReply: () => call(() => { if (S.replyTarget) S.replyTarget.value = null; }),
      deleteMessage: (id) => call(async () => {
        const yes = await window.ui.confirm({ title: 'Delete this message?', message: 'Relays are not required to honor deletion, and other clients may already have cached it.', confirmLabel: 'Delete', danger: true });
        if (!yes) return;
        if (S.replyTarget && S.replyTarget.value && S.replyTarget.value.id === id) S.replyTarget.value = null;
        return window.chat.deleteMessage(id)?.catch?.((e) => window.ui && window.ui.showToast && window.ui.showToast('Delete failed: ' + (e && e.message || 'unknown'), 3000, 'error'));
      }),
      resolveProfile: (id) => (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(id)) || null,
      reactToMessage: (id, authorPubkey, emoji) => call(() => {
        if (!window.nostrReactions) return;
        const mine = window.nostrReactions.getFor(id).find((r) => r.mine);
        if (mine && (!emoji || mine.content === emoji)) return window.nostrReactions.unreact(id);
        return window.nostrReactions.react(id, authorPubkey, emoji || '+').catch((e) => window.ui && window.ui.showToast && window.ui.showToast('Reaction failed: ' + (e && e.message || 'unknown'), 3000, 'error'));
      }),
      attachFiles: (files) => call(() => {
        const lock = composerLock(v);
        if (lock) { window.ui.showToast(lock.toast, 3000, 'error'); return; }
        if (window.state.homeMode) { window.ui.showToast('Attachments are not supported in direct messages yet', 3500, 'error'); return; }
        for (const file of files) {
          window.chat.sendImage(file);
        }
      }),
      openThread: (id) => call(() => window.threadManager && window.threadManager.select(id)),
      selectThread: (id) => call(() => window.threadManager && window.threadManager.select(id)),
      createThread: () => call(() => {
        const parentId = v('currentChannel', null)?.id;
        return window.threadManager && window.threadManager.create(parentId);
      }),
      closeThreadPanel: () => call(() => window.threadManager && window.threadManager.closePanel()),
      replyToThread: (text) => call(() => window.threadManager && window.threadManager.replyToForumPost(text)),
      newForumPost: () => call(() => window.channelManager && window.channelManager.showNewForumPostModal()),
      editPage: () => call(() => {
        const ch = v('currentChannel', null);
        if (!ch || ch.type !== 'page' || !window.serverPages || !window.serverManager) return;
        const existing = (window.serverPages.getPages(ch._serverId) || []).find(p => p.slug === ch._slug);
        window.serverManager.showEditPageModal(ch._serverId, ch._slug, existing ? existing.title : ch.name, existing ? existing.html : '');
      }),
    },
  };
}
