import { dmSnapshot } from './dm.js';

const LOCK_ANNOUNCEMENT = { reason: 'Only admins can post here', toast: 'Only admins can post in announcement channels' };
export const LOCK_DM = { reason: 'Pick or start a conversation', toast: 'Start a conversation with the + button next to "direct messages".' };

export function composerLock(v) {
  if (!!(window.state && window.state.homeMode) && !v('activeDmPeer', null)) return LOCK_DM;
  const curr = v('currentChannel', null);
  const sid = v('currentServerId', null);
  if (curr && curr.type === 'announcement' && !(window.serverRoles && sid && window.serverRoles.isAdmin(sid))) return LOCK_ANNOUNCEMENT;
  return null;
}

export function resolveAuthor(pk) {
  if (!pk) return '';
  return (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(pk))
    || (window.auth && window.auth.npubShort && window.auth.npubShort(pk))
    || '';
}

export function deriveFrame(v) {
  const homeMode = !!(window.state && window.state.homeMode);
  const dm = homeMode ? dmSnapshot(v) : null;
  const curr = dm ? dm.currentChannel : v('currentChannel', null);
  const sid = v('currentServerId', null);
  const isPage = curr && curr.type === 'page';
  const pageData = isPage && window.serverPages
    ? (window.serverPages.getPages(curr._serverId || sid) || []).find(p => p.slug === curr._slug)
    : null;
  const canManage = !!(window.serverRoles && sid && window.serverRoles.isAdmin(sid));
  const lock = composerLock(v);
  const unreadCounts = (window.nostrUnread && window.nostrUnread.countsFor) ? window.nostrUnread.countsFor() : {};
  return { homeMode, dm, curr, sid, pageData, canManage, lock, unreadCounts };
}

export const helpers = {
  avatarColor: (id) => (window.getAvatarColor && window.getAvatarColor(id)) || 'var(--accent)',
  initial: (n) => (window.getInitial ? window.getInitial(n) : String(n || '?').slice(0, 1).toUpperCase()),
  formatTime: (t) => (window.formatTime ? window.formatTime(t) : new Date(t || Date.now()).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })),
};
