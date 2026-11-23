import { registerModule } from '../registry.js';
import { remindersFor } from '../../reminders.js';
import { savedList } from '../../saved.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MENTION_LIMIT = 50;

registerModule({
  id: 'inbox', kind: 'service',
  setup(ctx) {
    const { S, v, call, state } = ctx;

    const mentions = () => {
      const me = state.nostrPubkey || null;
      const name = me && ctx.chat ? ctx.chat.resolveProfile(me) : '';
      if (!name) return [];
      const re = new RegExp('(^|\\s)@' + escapeRegex(name) + '(?![\\w.-])', 'i');
      const everyoneRe = ctx.account && ctx.account.everyonePings() ? /(^|\s)@(everyone|here)(?![\w.-])/i : null;
      return (state.chatMessages || []).filter((m) => re.test(String(m.content || '')) || (everyoneRe && everyoneRe.test(String(m.content || '')))).slice(-MENTION_LIMIT).reverse().map((m) => ({ id: m.id, who: m.username || m.userId, text: m.content }));
    };

    const flashMessage = (id) => {
      const el = document.getElementById('m-' + id);
      if (!el) { ctx.toast('That message is not loaded in this channel', 2500); return; }
      el.scrollIntoView({ block: 'center' });
      el.classList.add('ds-g3-flash');
      setTimeout(() => el.classList.remove('ds-g3-flash'), 1600);
    };

    return {
      snapshot: () => {
        const counts = ctx.unread && ctx.unread.countsFor ? ctx.unread.countsFor() : {};
        v('savedVersion', 0);
        return {
          unreadTotal: Object.values(counts).reduce((n, c) => n + (c || 0), 0),
          reminders: remindersFor(),
          savedMessages: savedList(),
          savedIds: savedList().map((x) => x.id),
          inboxTab: v('inboxTab', 'mentions'),
          mentions: mentions(),
          chatSearch: v('chatSearch', ''),
        };
      },
      actions: {
        markAllRead: () => call(() => {
          const u = ctx.unread;
          if (!u || !u.countsFor || !u.markRead) return;
          Object.keys(u.countsFor()).forEach((id) => u.markRead(id));
        }),
        jumpToMessage: (id) => call(() => { if (S.gameSurface) S.gameSurface.value = null; setTimeout(() => flashMessage(id), 50); }),
        setChatSearch: (q) => call(() => { if (S.chatSearch) S.chatSearch.value = String(q || ''); }),
        setInboxTab: (t) => call(() => { if (S.inboxTab) S.inboxTab.value = t; }),
      },
    };
  },
});
