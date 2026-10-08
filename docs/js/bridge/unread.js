export function installUnread(ww) {
  const unread = ww.unread;
  unread.addEventListener('unread', () => { state.unreadVersion = (state.unreadVersion || 0) + 1; });
  window.nostrUnread = {
    countsFor: () => unread.countsFor(),
    countFor: (id) => unread.countFor(id),
    markRead: (id) => unread.markRead(id)
  };
}
