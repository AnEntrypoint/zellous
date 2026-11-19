import { subscribeChannelEvents } from '../events-feed.js';
import { leaderboardFor } from '../xp.js';
import { pollsFor } from '../polls.js';
import { recapFor } from '../recap.js';
import { remindersFor } from '../reminders.js';
import { pinsFor } from '../pins.js';
import { rulesFor } from '../rules.js';
import { announcementsFor } from '../announcements.js';

const PREFS = [
  { key: 'notificationsEnabled', store: 'zellous-notifications', label: 'Notifications' },
  { key: 'messagePreviewEnabled', store: 'zellous-message-preview', label: 'Message preview' },
  { key: 'soundEnabled', store: 'zellous-sound', label: 'Sound' },
];

export function buildGame({ v, S, call, persistBool }) {
  let stopEvents = null;
  const startEvents = () => {
    if (stopEvents) stopEvents();
    stopEvents = null;
    const ch = v('currentChannel', null);
    if (S.channelEvents) S.channelEvents.value = [];
    subscribeChannelEvents(ch && ch.id, v('currentServerId', null), (list) => { if (S.channelEvents) S.channelEvents.value = list; }).then((stop) => { stopEvents = stop; });
  };
  const stopEventsFeed = () => { if (stopEvents) stopEvents(); stopEvents = null; };
  return {
    snapshot: () => {
      const counts = (window.nostrUnread && window.nostrUnread.countsFor) ? window.nostrUnread.countsFor() : {};
      return {
        unreadTotal: Object.values(counts).reduce((n, c) => n + (c || 0), 0),
        gamePrefOpen: v('gamePrefOpen', false),
        gamePrefToggles: PREFS.map((p) => ({ key: p.key, label: p.label, checked: !!v(p.key, true) })),
        gameServerCreateOpen: v('gameServerCreateOpen', false),
        serverColors: Array.isArray(window.AVATAR_COLORS) ? window.AVATAR_COLORS : [],
        gameSurface: v('gameSurface', null),
        channelEvents: v('channelEvents', []),
        reminders: remindersFor(),
        rules: rulesFor(v('channels', [])),
        announcements: announcementsFor(v('chatMessages', []), window.state && window.state.nostrPubkey).map((p) => ({ ...p, name: (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(p.author)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(p.author) : p.author.slice(0, 8)) })),
        pins: pinsFor(v('chatMessages', []), window.state && window.state.nostrPubkey).map((p) => ({ ...p, name: (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(p.author)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(p.author) : p.author.slice(0, 8)) })),
        recap: recapFor(v('chatMessages', []), window.state && window.state.nostrPubkey, (window.nostrUnread && window.nostrUnread.countFor && v('currentChannel', null) && window.nostrUnread.countFor(v('currentChannel', null).id)) || 0).map((r) => ({ ...r, name: (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(r.author)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(r.author) : r.author.slice(0, 8)) })),
        polls: pollsFor(v('chatMessages', [])).map((p) => ({ ...p, name: (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(p.author)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(p.author) : '') })),
        leaderboard: leaderboardFor(v('chatMessages', [])).map((r) => ({ ...r, name: (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(r.id)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(r.id) : r.id.slice(0, 8)) })),
      };
    },
    actions: {
      markAllRead: () => call(() => {
        const u = window.nostrUnread;
        if (!u || !u.countsFor || !u.markRead) return;
        Object.keys(u.countsFor()).forEach((id) => u.markRead(id));
      }),
      openGamePrefs: () => call(() => { if (S.gamePrefOpen) S.gamePrefOpen.value = true; }),
      closeGamePrefs: () => call(() => { if (S.gamePrefOpen) S.gamePrefOpen.value = false; }),
      openServerCreate: () => call(() => { if (S.gameServerCreateOpen) S.gameServerCreateOpen.value = true; }),
      closeServerCreate: () => call(() => { if (S.gameServerCreateOpen) S.gameServerCreateOpen.value = false; }),
      openSurface: (name) => call(() => { if (S.gameSurface) S.gameSurface.value = name; if (name === 'events') startEvents(); }),
      closeSurface: () => call(() => { if (S.gameSurface) S.gameSurface.value = null; stopEventsFeed(); }),
      createServer: (name, color) => call(async () => {
        if (!window.serverManager || !window.serverManager.create) return;
        try {
          await window.serverManager.create(name, color);
          if (S.gameServerCreateOpen) S.gameServerCreateOpen.value = false;
        } catch (e) {
          if (window.ui && window.ui.showToast) window.ui.showToast('Create server failed: ' + ((e && e.message) || 'unknown'), 3000, 'error');
        }
      }),
      setGamePref: (key, val) => call(() => {
        const p = PREFS.find((x) => x.key === key);
        if (p) persistBool(key, p.store, val);
      }),
    },
  };
}
