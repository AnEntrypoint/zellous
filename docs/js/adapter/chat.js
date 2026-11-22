import { composerLock, LOCK_DM, resolveAuthor } from './frame.js';
import { pollsFor } from '../polls.js';
import { runCommand } from '../commands.js';
import { unfurlText } from '../unfurl.js';
import { toggleSaved } from '../saved.js';
import { addReminder } from '../reminders.js';

const nameOf = (pk) => (window.chat && window.chat.resolveProfile(pk)) || String(pk || '').slice(0, 8);

const lastJoinOf = (uid) => {
  const mem = window.nostrMembership;
  const list = (window.chat && window.chat.messages) || [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i].userId === uid && mem.parseJoin(list[i].content)) return list[i].id;
  return null;
};

const membershipView = (m, base) => {
  const mem = window.nostrMembership;
  const st = window.state || {};
  if (!mem) return null;
  const join = mem.parseJoin(m.content);
  if (join) return { ...base, type: 'system', sys: { name: nameOf(m.userId), text: join, userId: m.userId, canWave: m.userId !== st.nostrPubkey && lastJoinOf(m.userId) === m.id } };
  const wave = mem.parseWave(m.content);
  if (wave) return { ...base, content: '👋 waves at ' + nameOf(wave) };
  const inv = mem.parseInvite(m.content);
  if (!inv) return null;
  const here = inv.serverId === st.currentServerId;
  const members = here ? (st.roomMembers || []) : null;
  return { ...base, invite: { name: inv.name, color: inv.color, valid: inv.valid, serverId: inv.serverId, joined: (st.servers || []).some((x) => x && x.id === inv.serverId), online: members ? members.filter((x) => x.online !== false).length : null, members: members ? members.length : null } };
};

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
        composerLockedNope: !!(lock && lock.permission),
        stickerBase: new URL('../assets/stickers/', location.href).href,
        newAt: curr && window.nostrUnread ? window.nostrUnread.boundaryFor(curr.id) : null,
        messages: (dm ? dm.messages : ((window.chat && window.chat.messages) || v('chatMessages', []))).filter((m) => !v('chatSearch', '') || String(m.content || '').toLowerCase().includes(String(v('chatSearch', '')).toLowerCase())).map((m) => {
          const rx = window.nostrReactions && m.id ? window.nostrReactions.getFor(m.id) : [];
          const base = rx.length ? { ...m, reactions: rx.map((r) => ({ emoji: r.content, count: r.count, you: r.mine })) } : m;
          const mv = membershipView(m, base);
          if (mv) return mv;
          const p = pollsFor([m])[0];
          if (!p || !window.nostrPolls) return base;
          const t = window.nostrPolls.tally(p.id, p.options.length);
          window.nostrPolls.subscribe(p.id);
          return { ...base, poll: { id: p.id, question: p.question, options: p.options, counts: t.counts, total: t.total, mine: t.mine } };
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
      send: (raw, opts) => call(() => {
        const cmd = runCommand(raw, nameOf(window.state.nostrPubkey));
        if (cmd.notice) { window.ui.showToast(cmd.notice, 5000, 'info'); if (S.chatInputValue) S.chatInputValue.value = ''; return; }
        const text = cmd.text;
        if (window.state.homeMode) {
          const peer = v('activeDmPeer', null);
          if (!peer) { window.ui.showToast(LOCK_DM.toast, 3500, 'error'); return; }
          window.dm.send(peer, text).then(() => { if (S.chatInputValue) S.chatInputValue.value = ''; }, (e) => window.ui.showToast('Could not send: ' + (e && e.message || 'unknown'), 4000, 'error'));
          return;
        }
        return unfurlText(text).then((previews) => window.chat.send(text, previews.length ? { ...opts, previews } : opts)).then(() => { if (S.replyTarget) S.replyTarget.value = null; if (S.chatInputValue) S.chatInputValue.value = ''; else if (window.state) window.state.chatInputValue = ''; }); }),
      retrySend: (id) => call(() => (window.state.homeMode ? window.dm.retry(id) : window.chat.retrySend(id))),
      toggleSave: (item) => call(() => toggleSaved(item)),
      remindMe: (minutes, item) => call(() => { addReminder(minutes, item); window.ui.showToast('Reminder set', 3000, 'info', 'in ' + (minutes >= 1440 ? '1 day' : minutes >= 60 ? (minutes / 60) + ' hour' + (minutes > 60 ? 's' : '') : minutes + ' minutes')); }),
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
