import { SOUNDS, playSoundboard } from '../soundboard.js';
import { subscribeChannelEvents } from '../events-feed.js';
import { leaderboardFor } from '../xp.js';
import { pollsFor } from '../polls.js';
import { recapFor } from '../recap.js';
import { remindersFor } from '../reminders.js';
import { pinsFor } from '../pins.js';
import { rulesFor } from '../rules.js';
import { subscribeSplitMessages } from '../split-feed.js';
import { announcementsFor } from '../announcements.js';
import { rolesFor } from '../roles.js';

const PREFS = [
  { key: 'compact', signal: 'pref_compact', store: 'zellous-pref-compact', def: false, radio: true },
  { key: 'h24', signal: 'pref_h24', store: 'zellous-pref-h24', def: false, label: '24-hour time', hint: '13:37 instead of 1:37 PM' },
  { key: 'sound', signal: 'soundEnabled', store: 'zellous-sound', def: true, label: 'Message sounds', hint: 'a soft ping when someone posts where you can hear it' },
  { key: 'motion', signal: 'pref_motion', store: 'zellous-pref-motion', def: false, label: 'Reduced motion', hint: 'stops animations: typing dots, the radio bars, flashes' },
  { key: 'ulinks', signal: 'pref_ulinks', store: 'zellous-pref-ulinks', def: false, label: 'Always underline links', hint: 'easier to tell links from text' },
  { key: 'rolecolors', signal: 'roleColorsEnabled', store: 'zellous-role-colors', def: true, label: 'Show role colours on names', hint: 'off: every name in the chat is plain' },
  { key: 'previews', signal: 'messagePreviewEnabled', store: 'zellous-message-preview', def: true, label: 'Link previews', hint: 'a card under links, with YouTube thumbnails' },
  { key: 'embeds', signal: 'pref_embeds', store: 'zellous-pref-embeds', def: true, label: 'Show pictures from links', hint: 'image links show the picture itself' },
  { key: 'jumbo', signal: 'pref_jumbo', store: 'zellous-pref-jumbo', def: true, label: 'Big emoji', hint: 'a message of only emoji shows them large' },
  { key: 'spoilers', signal: 'pref_spoilers', store: 'zellous-pref-spoilers', def: false, label: 'Always reveal spoilers', hint: 'no click needed on ||hidden|| text' },
  { key: 'vcsounds', signal: 'pref_vcsounds', store: 'zellous-pref-vcsounds', def: true, label: 'Join and leave sounds', hint: 'the bloop when someone enters or leaves your voice room' },
  { key: 'sbsounds', signal: 'pref_sbsounds', store: 'zellous-pref-sbsounds', def: true, label: 'Hear the soundboard', hint: 'off: airhorns and rimshots skip you' },
  { key: 'mentionsonly', signal: 'pref_mentionsonly', store: 'zellous-pref-mentionsonly', def: false, label: 'Only ping for mentions', hint: 'stay quiet unless someone @s you or says an alert word' },
  { key: 'devmode', signal: 'pref_devmode', store: 'zellous-pref-devmode', def: false, label: 'Developer Mode', hint: 'adds Copy Message ID and Copy User ID' },
];

export function buildGame({ v, S, call, persistBool }) {
  const applyMotion = (on) => { if (typeof document !== 'undefined') document.documentElement.classList.toggle('zellous-motion-reduced', !!on); };
  applyMotion(v('pref_motion', false));
  const applyUlinks = (on) => { if (typeof document !== 'undefined') document.documentElement.classList.toggle('zellous-ulinks', !!on); };
  applyUlinks(v('pref_ulinks', false));
  const applySpoilers = (on) => { if (typeof document !== 'undefined') document.documentElement.classList.toggle('zellous-spoilers', !!on); };
  applySpoilers(v('pref_spoilers', false));
  let stopEvents = null;
  const startEvents = () => {
    if (stopEvents) stopEvents();
    stopEvents = null;
    const ch = v('currentChannel', null);
    if (S.channelEvents) S.channelEvents.value = [];
    subscribeChannelEvents(ch && ch.id, v('currentServerId', null), (list) => { if (S.channelEvents) S.channelEvents.value = list; }).then((stop) => { stopEvents = stop; });
  };
  const stopEventsFeed = () => { if (stopEvents) stopEvents(); stopEvents = null; };
  let stopSplit = null;
  const startSplit = () => {
    if (stopSplit) stopSplit();
    stopSplit = null;
    const cur = v('currentChannel', null);
    const other = (v('channels', []) || []).find((c) => c && c.id !== (cur && cur.id) && c.type !== 'voice' && c.type !== 'threaded' && c.type !== 'announcement' && c.type !== 'page');
    if (S.splitChannel) S.splitChannel.value = other || null;
    if (S.splitMessages) S.splitMessages.value = [];
    if (!other) return;
    subscribeSplitMessages(other.id, v('currentServerId', null), (list) => { if (S.splitMessages) S.splitMessages.value = list; }).then((stop) => { stopSplit = stop; });
  };
  const stopSplitFeed = () => { if (stopSplit) stopSplit(); stopSplit = null; };
  const currentChannelRef = () => { const ch = v('currentChannel', null); return ch && ch.id ? ch : null; };
  const startPins = () => { const ch = currentChannelRef(); if (ch && window.nostrPins) window.nostrPins.subscribe(v('currentServerId', null), ch.id); };
  const createEvent = (f) => {
    const ch = currentChannelRef();
    if (!ch || !window.nostrEvents) return;
    return window.nostrEvents.create(v('currentServerId', null), ch.id, { title: f.title, about: f.about, start: Math.floor(f.at / 1000) }).catch((e) => { if (window.ui && window.ui.showToast) window.ui.showToast('Create event failed: ' + ((e && e.message) || 'unknown'), 3000, 'error'); });
  };
  const findEvent = (id) => (v('channelEvents', []) || []).find((e) => e.id === id) || null;
  const rsvpEvent = (id) => {
    const ev = findEvent(id);
    if (!ev || !window.nostrEvents) return;
    const me = window.state && window.state.nostrPubkey;
    return window.nostrEvents.rsvp(ev, !ev.going.includes(me)).catch((e) => { if (window.ui && window.ui.showToast) window.ui.showToast('RSVP failed: ' + ((e && e.message) || 'unknown'), 3000, 'error'); });
  };
  const deleteEvent = (id) => {
    const ev = findEvent(id);
    if (!ev || !window.nostrEvents) return;
    return window.nostrEvents.delete(ev).catch((e) => { if (window.ui && window.ui.showToast) window.ui.showToast('Cancel failed: ' + ((e && e.message) || 'unknown'), 3000, 'error'); });
  };
  const startPolls = () => { for (const p of pollsFor(v('chatMessages', []))) { if (window.nostrPolls) window.nostrPolls.subscribe(p.id); } };
  const votePoll = (id, i) => {
    const p = pollsFor(v('chatMessages', [])).find((x) => x.id === id);
    if (!p || !window.nostrPolls) return;
    return window.nostrPolls.vote(id, i, p.options.length).catch((e) => { if (window.ui && window.ui.showToast) window.ui.showToast('Vote failed: ' + ((e && e.message) || 'unknown'), 3000, 'error'); });
  };
  const pinMessage = (id) => {
    const ch = currentChannelRef();
    if (!ch || !window.nostrPins) return;
    return window.nostrPins.pin(v('currentServerId', null), ch.id, id).catch((e) => { if (window.ui && window.ui.showToast) window.ui.showToast('Pin failed: ' + ((e && e.message) || 'unknown'), 3000, 'error'); });
  };
  return {
    snapshot: () => {
      const counts = (window.nostrUnread && window.nostrUnread.countsFor) ? window.nostrUnread.countsFor() : {};
      return {
        unreadTotal: Object.values(counts).reduce((n, c) => n + (c || 0), 0),
        gamePrefOpen: v('gamePrefOpen', false),
        gamePrefCompact: !!v('pref_compact', false),
        devMode: !!v('pref_devmode', false),
        h24: !!v('pref_h24', false),
        jumbo: !!v('pref_jumbo', true),
        previews: !!v('messagePreviewEnabled', true),
        embeds: !!v('pref_embeds', true),
        vcsounds: !!v('pref_vcsounds', true),
        soundboard: SOUNDS.map(({ id, e, name }) => ({ id, e, name })),
        gamePrefToggles: PREFS.filter((p) => !p.radio).map((p) => ({ key: p.key, label: p.label, hint: p.hint, checked: !!v(p.signal, p.def) })),
        gameServerCreateOpen: v('gameServerCreateOpen', false),
        serverColors: Array.isArray(window.AVATAR_COLORS) ? window.AVATAR_COLORS : [],
        gameSurface: v('gameSurface', null),
        channelEvents: v('channelEvents', []).map((e) => ({ ...e, name: (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(e.author)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(e.author) : e.author.slice(0, 8)), mine: e.author === (window.state && window.state.nostrPubkey), interested: e.going.includes(window.state && window.state.nostrPubkey) })),
        reminders: remindersFor(),
        rules: rulesFor(v('channels', [])),
        roles: rolesFor(v('roomMembers', []), v('currentServerId', null)),
        splitChannel: v('splitChannel', null),
        splitMessages: (v('splitMessages', []) || []).map((m) => ({ ...m, name: (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(m.userId)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(m.userId) : m.userId.slice(0, 8)) })),
        discoverServers: v('servers', []).map((sv) => ({ id: sv.id, name: sv.name || 'server', current: sv.id === v('currentServerId', null) })),
        announcements: announcementsFor(v('chatMessages', []), window.state && window.state.nostrPubkey).map((p) => ({ ...p, name: (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(p.author)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(p.author) : p.author.slice(0, 8)) })),
        pins: pinsFor(v('chatMessages', []), window.state && window.state.nostrPubkey, v('channelPins', [])).map((p) => ({ ...p, name: (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(p.author)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(p.author) : p.author.slice(0, 8)) })),
        recap: recapFor(v('chatMessages', []), window.state && window.state.nostrPubkey, (window.nostrUnread && window.nostrUnread.countFor && v('currentChannel', null) && window.nostrUnread.countFor(v('currentChannel', null).id)) || 0).map((r) => ({ ...r, name: (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(r.author)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(r.author) : r.author.slice(0, 8)) })),
        polls: pollsFor(v('chatMessages', [])).map((p) => { const t = window.nostrPolls ? window.nostrPolls.tally(p.id, p.options.length) : { counts: p.options.map(() => 0), total: 0, mine: -1 }; v('pollVotesVersion', 0); return { ...p, ...t, name: (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(p.author)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(p.author) : '') }; }),
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
      explore: () => call(() => { if (S.gameSurface) S.gameSurface.value = 'discover'; }),
      openSurface: (name) => call(() => { if (S.gameSurface) S.gameSurface.value = name; if (name === 'events') startEvents(); if (name === 'split') startSplit(); if (name === 'pins') startPins(); if (name === 'polls') startPolls(); }),
      pinMessage: (id) => call(() => pinMessage(id)),
      createEvent: (f) => call(() => createEvent(f)),
      rsvpEvent: (id) => call(() => rsvpEvent(id)),
      votePoll: (id, i) => call(() => votePoll(id, i)),
      deleteEvent: (id) => call(() => deleteEvent(id)),
      closeSurface: () => call(() => { if (S.gameSurface) S.gameSurface.value = null; stopEventsFeed(); stopSplitFeed(); }),
      createServer: (name, color) => call(async () => {
        if (!window.serverManager || !window.serverManager.create) return;
        try {
          await window.serverManager.create(name, color);
          if (S.gameServerCreateOpen) S.gameServerCreateOpen.value = false;
        } catch (e) {
          if (window.ui && window.ui.showToast) window.ui.showToast('Create server failed: ' + ((e && e.message) || 'unknown'), 3000, 'error');
        }
      }),
      playSound: (id) => call(() => playSoundboard(id, () => !!v('pref_sbsounds', true))),
      setGamePref: (key, val) => call(() => {
        const p = PREFS.find((x) => x.key === key);
        if (p) persistBool(p.signal, p.store, val);
        if (key === 'motion') applyMotion(val);
        if (key === 'ulinks') applyUlinks(val);
        if (key === 'spoilers') applySpoilers(val);
      }),
    },
  };
}
