import { mentionsName, mentionsEveryone, alertHit } from '../notify.js';

export function installUnread(ww) {
  const unread = ww.unread;
  unread.addEventListener('unread', () => { state.unreadVersion = (state.unreadVersion || 0) + 1; });
  unread.setPingTest((event) => {
    const me = state.nostrPubkey;
    const name = me && window.chat ? window.chat.resolveProfile(me) : '';
    const alerts = String(state.pref_kw || '').split(',').map((w) => w.trim()).filter(Boolean);
    return mentionsName(event.content, name) || mentionsEveryone(event.content) || alertHit(event.content, alerts);
  });
  window.nostrUnread = {
    countsFor: () => unread.countsFor(),
    pingsFor: () => unread.pingsFor(),
    countFor: (id) => unread.countFor(id),
    markRead: (id) => unread.markRead(id),
    markUnread: (id, atSec) => unread.markUnread(id, atSec),
    boundaryFor: (id) => unread.boundaryFor(id)
  };
}
