import { SOUNDS, playSoundboard } from '../soundboard.js';
import { subscribeChannelEvents } from '../events-feed.js';
import { leaderboardFor, levelFor } from '../xp.js';
import { effect } from '@preact/signals';
import { pollsFor } from '../polls.js';
import { remindersFor } from '../reminders.js';
import { pinsFor } from '../pins.js';
import { rulesFor } from '../rules.js';
import { subscribeSplitMessages } from '../split-feed.js';
import { announcementsFor } from '../announcements.js';
import { GAME_ROLES } from '../selfroles.js';

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

const PREF_GROUP = { rolecolors: 'access', motion: 'access', ulinks: 'access', sound: 'notif', mentionsonly: 'notif', vcsounds: 'voice', sbsounds: 'voice', embeds: 'media', jumbo: 'media', spoilers: 'media', h24: 'lang', devmode: 'adv' };

export function buildGame({ v, S, call, persistBool }) {
  const storeText = (signal, key, text) => { if (S[signal]) S[signal].value = text; if (typeof localStorage !== 'undefined') localStorage.setItem(key, text); };
  const applyMotion = (on) => { if (typeof document !== 'undefined') document.documentElement.classList.toggle('zellous-motion-reduced', !!on); };
  applyMotion(v('pref_motion', false));
  const applyUlinks = (on) => { if (typeof document !== 'undefined') document.documentElement.classList.toggle('zellous-ulinks', !!on); };
  applyUlinks(v('pref_ulinks', false));
  const applySpoilers = (on) => { if (typeof document !== 'undefined') document.documentElement.classList.toggle('zellous-spoilers', !!on); };
  applySpoilers(v('pref_spoilers', false));
  let stopEvents = null;
  let stopRailEvents = [];
  effect(() => {
    const sid = S.currentServerId && S.currentServerId.value;
    const chans = (S.channels && S.channels.value) || [];
    stopRailEvents.forEach((stop) => stop && stop());
    stopRailEvents = [];
    if (!S.serverEvents) return;
    const lists = new Map();
    const flush = () => {
      const now = Date.now();
      const recent = [...lists.values()].flat().filter((e) => e.start * 1000 > now - 3 * 3600e3);
      S.serverEvents.value = { count: recent.length, live: recent.some((e) => e.start * 1000 <= now) };
    };
    chans.filter((c) => c && c.id).forEach((c) => {
      subscribeChannelEvents(c.id, sid, (list) => { lists.set(c.id, list); flush(); }).then((stop) => { stopRailEvents.push(stop); });
    });
    S.serverEvents.value = { count: 0, live: false };
  });
  const startEvents = () => {
    if (stopEvents) stopEvents();
    stopEvents = null;
    const ch = v('currentChannel', null);
    if (S.channelEvents) S.channelEvents.value = [];
    subscribeChannelEvents(ch && ch.id, v('currentServerId', null), (list) => { if (S.channelEvents) S.channelEvents.value = list; }).then((stop) => { stopEvents = stop; });
  };
  const stopEventsFeed = () => { if (stopEvents) stopEvents(); stopEvents = null; };
  let stopSplit = null;
  const setSplit = (other) => {
    if (stopSplit) stopSplit();
    stopSplit = null;
    if (S.splitChannel) S.splitChannel.value = other || null;
    if (S.splitMessages) S.splitMessages.value = [];
    if (!other) return;
    subscribeSplitMessages(other.id, v('currentServerId', null), (list) => { if (S.splitMessages) S.splitMessages.value = list; }).then((stop) => { stopSplit = stop; });
  };
  const splitTo = (id) => setSplit(id ? (v('channels', []) || []).find((c) => c && c.id === id) : null);
  const splitMain = () => { const sp = v('splitChannel', null); if (sp) goToChannel(sp.name); };
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
  const toggleSelfRole = (id) => {
    const sid = v('currentServerId', null);
    const me = (window.state && window.state.nostrPubkey) || null;
    if (!sid || !me || !window.nostrSelfRoles) return;
    const cur = window.nostrSelfRoles.roles(sid, me);
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    return window.nostrSelfRoles.set(sid, next).catch((e) => { if (window.ui && window.ui.showToast) window.ui.showToast('Role change failed: ' + ((e && e.message) || 'unknown'), 3000, 'error'); });
  };
  const startSelfRoles = () => { const sid = v('currentServerId', null); if (sid && window.nostrSelfRoles) window.nostrSelfRoles.subscribe(sid); };
  const roleGroupsFor = (members, sid) => {
    const mine = (m) => (window.nostrSelfRoles && sid ? window.nostrSelfRoles.roles(sid, m.id) : []);
    const groups = GAME_ROLES.map((r) => ({ id: r.id, label: r.name, count: (members || []).filter((m) => mine(m)[0] === r.id).length }));
    groups.push({ id: 'online', label: 'Online', count: (members || []).filter((m) => !mine(m).length).length });
    return groups;
  };
  const goToChannel = (name) => {
    S.gameSurface.value = null;
    const ch = v('channels', []).find((c) => c.name === name && c.type !== 'voice');
    if (ch && window.ui && window.ui.actions) window.ui.actions.switchChannel(ch);
  };
  const goToGeneral = () => { const first = (v('channels', []) || []).find((c) => c && c.type === 'text'); goToChannel(first ? first.name : 'general'); };
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
        gamePrefToggles: PREFS.filter((p) => !p.radio && PREF_GROUP[p.key]).map((p) => ({ key: p.key, label: p.label, hint: p.hint, checked: !!v(p.signal, p.def), group: PREF_GROUP[p.key] })),
        gamePrefKeywords: v('pref_kw', ''),
        gamePrefBanner: v('pref_banner', ''),
        gamePrefTab: v('gamePrefTab', 'account'),
        presenceStatus: (v('presenceVersion', 0), window.nostrPresence && window.state && window.state.nostrPubkey ? window.nostrPresence.statusOf(window.state.nostrPubkey).status : 'online'),
        presenceCustom: (v('presenceVersion', 0), window.nostrPresence && window.state && window.state.nostrPubkey ? window.nostrPresence.statusOf(window.state.nostrPubkey).custom : ''),
        gamePrefColor: (() => { v('selfRolesVersion', 0); const sid = v('currentServerId', null); const me = (window.state && window.state.nostrPubkey) || null; const sr = window.nostrSelfRoles; const ids = sr && sid && me ? sr.roles(sid, me) : []; return ids.length && sr.colorOf ? (sr.colorOf(ids[0]) || '') : ''; })(),
        gamePrefName: (v('profilesVersion', 0), (window.state && window.state.nostrPubkey && window.chat) ? window.chat.resolveProfile(window.state.nostrPubkey) : 'You'),
        gamePrefServers: (v('servers', []) || []).length,
        gamePrefMuted: (v('mutedChannels', []) || []).map((id) => ({ id, name: ((v('channels', []) || []).find((c) => c && c.id === id) || { name: id }).name })),
        myXp: ((window.state && window.state.chatMessages) || []).filter((m) => m && window.state && m.userId === window.state.nostrPubkey).length * 10,
        gameServerCreateOpen: v('gameServerCreateOpen', false),
        serverColors: Array.isArray(window.AVATAR_COLORS) ? window.AVATAR_COLORS : [],
        gameSurface: v('gameSurface', null),
        channelEvents: v('channelEvents', []).map((e) => ({ ...e, name: (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(e.author)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(e.author) : e.author.slice(0, 8)), mine: e.author === (window.state && window.state.nostrPubkey), interested: e.going.includes(window.state && window.state.nostrPubkey) })),
        reminders: remindersFor(),
        rules: rulesFor(v('channels', [])),
        roles: roleGroupsFor(v('roomMembers', []), v('currentServerId', null), v('selfRolesVersion', 0)),
        rulesStats: (() => { const m = v('roomMembers', []); return { online: m.filter((x) => x.online).length, members: m.length }; })(),
        selfRoles: (() => { v('selfRolesVersion', 0); const sid = v('currentServerId', null); const me = (window.state && window.state.nostrPubkey) || null; const mine = window.nostrSelfRoles && sid && me ? window.nostrSelfRoles.roles(sid, me) : []; return GAME_ROLES.map((r) => ({ ...r, on: mine.includes(r.id), online: window.nostrSelfRoles && sid ? window.nostrSelfRoles.holders(sid, r.id) : 0 })); })(),
        splitChannel: v('splitChannel', null),
        eventCount: v('serverEvents', { count: 0 }).count,
        eventLive: v('serverEvents', { live: false }).live,
        myLevel: levelFor((window.state && window.state.chatMessages) || [], (window.state && window.state.nostrPubkey) || null).level,
        chatSearch: v('chatSearch', ''),
        inboxTab: v('inboxTab', 'mentions'),
        mentions: (() => { const me = (window.state && window.state.nostrPubkey) || null; const name = me && window.chat ? window.chat.resolveProfile(me) : ''; if (!name) return []; const re = new RegExp('(^|\\s)@' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w.-])', 'i'); return ((window.state && window.state.chatMessages) || []).filter((m) => re.test(String(m.content || ''))).slice(-50).reverse().map((m) => ({ id: m.id, who: m.username || m.userId, text: m.content })); })(),
        mutedChannel: (v('mutedChannels', []) || []).includes((v('currentChannel', null) || {}).id),
        splitOptions: (() => { const cur = v('currentChannel', null); return (v('channels', []) || []).filter((c) => c && (c.type === 'text' || c.type === 'announcement') && !(cur && c.id === cur.id)).map((c) => ({ id: c.id, name: c.name })); })(),
        splitMessages: (v('splitMessages', []) || []).slice().reverse().map((m) => ({ ...m, time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !v('pref_h24', false) }), name: (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(m.userId)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(m.userId) : m.userId.slice(0, 8)) })),
        discoverServers: v('servers', []).map((sv) => { const current = sv.id === v('currentServerId', null); const ownerPk = String(sv.id).includes(':') && !String(sv.id).startsWith('0'.repeat(64)) ? String(sv.id).split(':')[0] : null; const members = v('roomMembers', []); return { id: sv.id, name: sv.name || 'server', current, owner: ownerPk ? ((window.chat && window.chat.resolveProfile && window.chat.resolveProfile(ownerPk)) || ownerPk.slice(0, 12)) : 'nobody (public room)', members: current ? members.length : null, online: current ? members.filter((m) => m.online).length : null, channels: current ? v('channels', []).filter((c) => c.type !== 'voice').map((c) => c.name) : null }; }),
        announcements: announcementsFor(v('chatMessages', []), window.state && window.state.nostrPubkey).map((p) => ({ ...p, name: (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(p.author)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(p.author) : p.author.slice(0, 8)) })),
        pins: pinsFor(v('chatMessages', []), window.state && window.state.nostrPubkey, v('channelPins', [])).map((p) => ({ ...p, name: (window.chat && window.chat.resolveProfile && window.chat.resolveProfile(p.author)) || (window.auth && window.auth.npubShort ? window.auth.npubShort(p.author) : p.author.slice(0, 8)) })),
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
      jumpToMessage: (id) => call(() => { if (S.gameSurface) S.gameSurface.value = null; setTimeout(() => { const el = typeof document !== 'undefined' ? document.getElementById('m-' + id) : null; if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('ds-g3-flash'); setTimeout(() => el.classList.remove('ds-g3-flash'), 1600); } else if (window.ui && window.ui.showToast) window.ui.showToast('That message is not loaded in this channel', 2500, 'error'); }, 50); }),
      openGamePrefs: () => call(() => { if (S.gamePrefOpen) S.gamePrefOpen.value = true; }),
      closeGamePrefs: () => call(() => { if (S.gamePrefOpen) S.gamePrefOpen.value = false; }),
      openServerCreate: () => call(() => { if (S.gameServerCreateOpen) S.gameServerCreateOpen.value = true; }),
      closeServerCreate: () => call(() => { if (S.gameServerCreateOpen) S.gameServerCreateOpen.value = false; }),
      explore: () => call(() => { if (S.gameSurface) S.gameSurface.value = 'discover'; }),
      openSurface: (name) => call(() => { if (name === 'announcements') return goToChannel('announcements'); if (S.gameSurface) S.gameSurface.value = name; if (name === 'events') startEvents(); if (name === 'pins') startPins(); if (name === 'polls') startPolls(); if (name === 'pick-roles') startSelfRoles(); }),
      pinMessage: (id) => call(() => pinMessage(id)),
      toggleSelfRole: (id) => call(() => toggleSelfRole(id)),
      goToGeneral: () => call(() => goToGeneral()),
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
      setGamePrefTab: (t) => call(() => { if (S.gamePrefTab) S.gamePrefTab.value = t; }),
      splitTo: (id) => call(() => splitTo(id)),
      setChatSearch: (q) => call(() => { if (S.chatSearch) S.chatSearch.value = String(q || ''); }),
      setInboxTab: (t) => call(() => { if (S.inboxTab) S.inboxTab.value = t; }),
      setPresence: (status, custom) => call(() => window.nostrPresence && window.nostrPresence.set(status, custom)),
      toggleMuteId: (id) => call(() => { const list = S.mutedChannels.value || []; const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id]; S.mutedChannels.value = next; localStorage.setItem('zellous-muted-channels', JSON.stringify(next)); }),
      toggleMuteChannel: () => call(() => { const cur = v('currentChannel', null); if (!cur || !S.mutedChannels) return; const list = S.mutedChannels.value || []; const next = list.includes(cur.id) ? list.filter((x) => x !== cur.id) : [...list, cur.id]; S.mutedChannels.value = next; localStorage.setItem('zellous-muted-channels', JSON.stringify(next)); }),
      splitMain: () => call(() => splitMain()),
      setGamePref: (key, val) => call(() => {
        if (key === 'kw') return storeText('pref_kw', 'zellous-pref-kw', String(val || '').slice(0, 200));
        if (key === 'banner') return storeText('pref_banner', 'zellous-pref-banner', String(val || ''));
        if (key === 'reset') { PREFS.forEach((p) => persistBool(p.signal, p.store, p.def)); storeText('pref_kw', 'zellous-pref-kw', ''); storeText('pref_banner', 'zellous-pref-banner', ''); applyMotion(false); applyUlinks(false); applySpoilers(false); return; }
        const p = PREFS.find((x) => x.key === key);

        if (p) persistBool(p.signal, p.store, val);
        if (key === 'motion') applyMotion(val);
        if (key === 'ulinks') applyUlinks(val);
        if (key === 'spoilers') applySpoilers(val);
      }),
    },
  };
}
