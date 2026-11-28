import { lineKey, ownServer, uid, listedServers } from './parity-ref.mjs';
import { pubkeyOf } from './parity-zel.mjs';
import { NOW_MS } from './parity-fixture.mjs';

const GEAR = '.ds-g3-ibtn[aria-label="user settings"]';
const SHEAD = '.shead';
const R = { rail: true };
const ch = (name) => ({ click: `.chans a:has-text("${name}")`, rail: true });
const MENU = (label) => ({ click: `.ds-g3-smenu [role=menuitem]:has-text("${label}")` });
const openMembers = { signal: ['memberListOpen', true] };
const TAB = { 'My Account': 'account', Profiles: 'profile', Appearance: 'appearance', Accessibility: 'access', 'Voice & Audio': 'voice', Notifications: 'notif', 'Chat & Media': 'media', 'Language & Time': 'lang', Keybinds: 'keys', Advanced: 'adv' };
const PUBLIC_AS_GAME3 = `(() => { const ch = window.__zellous.wireweave.channels; const def = window.__parityChannels; ch.channels = def.channels; ch.categories = def.categories; ch._emit('updated', { channels: ch.channels, categories: ch.categories }); })()`;
const iso = (min) => new Date(NOW_MS - min * 60000).toISOString();

const settingsScreens = Object.entries(TAB).map(([label, tab]) => ({
  id: 'settings/' + tab,
  ref: (r) => { r.session.settings = true; r.session.setTab = tab; },
  zel: [{ click: GEAR, rail: true }, { pane: label }],
}));

const dmMail = (r) => {
  const me = { userId: uid('me'), displayName: 'Alex' }, mira = { userId: uid('mira'), displayName: 'Mira' };
  r.player.mail = [
    { topic: 'dm', from: mira, to: me, at: iso(40), text: 'hey, are you around?', read: true },
    { topic: 'dm', from: me, to: mira, at: iso(39), text: 'yes, give me a second' },
  ];
};

export const SCREENS = [
  { id: 'text-channel', ref: () => {}, zel: [] },
  { id: 'text-channel-empty', ref: (r) => { r.player.state.channel = 'gaming'; }, zel: [ch('gaming')] },
  { id: 'announcements-locked', ref: (r) => { r.player.state.channel = 'announcements'; }, zel: [ch('announcements')] },
  { id: 'page-rules', ref: (r) => { r.player.state.channel = 'rules'; }, zel: [ch('rules')] },
  { id: 'page-pick-roles', ref: (r) => { r.player.state.channel = 'pick-roles'; }, zel: [ch('pick-roles')] },
  { id: 'home', ref: (r) => { r.session.view = 'home'; }, zel: [{ click: '.ca-rail-home', rail: true }] },
  { id: 'dm-thread', ref: (r) => { r.session.view = 'dm'; r.session.dm = { uid: uid('mira'), name: 'Mira' }; }, zel: [openMembers, { click: '.ds-g3-mrow:has-text("Mira")' }, { click: '.ds-g3-btnp, button:has-text("Message")' }] },
  { id: 'member-list-hidden', vp: 'desktop', ref: (r) => { r.session.hideMembers = true; }, zel: [{ click: '.ds-g3-ibtn[aria-label="Member List"]' }] },
  { id: 'profile-card', ref: (r) => { r.session.profile = uid('mira'); }, zel: [openMembers, { click: '.ds-g3-mrow:has-text("Mira")' }] },
  { id: 'profile-card-self', ref: (r) => { r.session.profile = uid('me'); }, zel: [openMembers, { click: '.ds-g3-mrow:has-text("Alex")' }] },
  { id: 'pins-popover', ref: (r) => { r.session.pins = true; }, zel: [{ click: '.ds-g3-ibtn[aria-label="Pinned Messages"]' }] },
  { id: 'inbox-popover', ref: (r) => { r.session.mbox = true; }, zel: [{ click: '.ds-g3-ibtn[aria-label="Inbox"]' }] },
  { id: 'search-results', vp: 'desktop', ref: (r) => { r.session.search = 'check'; }, zel: [{ fill: ['.ds-g3-srch input', 'check'] }, { key: 'Enter' }] },
  { id: 'quick-switcher', ref: (r) => { r.session.switcher = true; }, zel: [{ key: 'Control+p', rail: true }] },
  { id: 'events-modal', ref: (r) => { r.session.events = true; }, zel: [ch('Events')] },
  { id: 'leaderboard-modal', ref: (r) => { r.session.leaderboard = true; }, zel: [ch('Leaderboard')] },
  { id: 'server-menu', ref: (r, { mobile }) => { ownServer(r); r.session.serverMenu = true; if (mobile) r.session.drawer = true; }, zel: [{ click: SHEAD, rail: true }] },
  { id: 'status-menu', ref: (r, { mobile }) => { r.session.statusMenu = true; if (mobile) r.session.drawer = true; }, zel: [{ click: '.ds-g3-mes', rail: true }] },
  { id: 'emoji-picker', ref: (r) => { r.session.picker = true; }, zel: [{ click: '.ds-g3-compbtn[title="Emoji"]' }] },
  { id: 'sticker-picker', ref: (r) => { r.session.stickers = true; }, zel: [{ click: '.ds-g3-compbtn[title="Stickers"]' }] },
  { id: 'reaction-picker', vp: 'desktop', ref: (r) => { r.session.rxFor = lineKey('general', 9); }, zel: [{ hover: '.ds-g3-msg' }, { click: '.ds-g3-bar [title="Add Reaction"]' }] },
  { id: 'message-more-menu', vp: 'desktop', ref: (r) => { r.session.moreFor = lineKey('general', 8); }, zel: [{ hover: '.ds-g3-msg:has(.ds-g3-pollcard)' }, { click: '.ds-g3-bar [title="More"]' }] },
  { id: 'message-hover-bar', vp: 'desktop', ref: () => {}, refSteps: [{ hoverFirst: '.msgs > .grp' }], zel: [{ hover: '.ds-g3-msg' }] },
  { id: 'composer-reply', vp: 'desktop', ref: (r) => { r.session.reply = { key: lineKey('general', 9), name: 'Jun' }; }, refSteps: [{ js: "document.querySelector('.msgs').scrollTop=0" }], zel: [{ hover: '.ds-g3-msg' }, { click: '.ds-g3-bar [title="Reply"]' }] },
  { id: 'composer-autocomplete-slash', ref: (r) => { r.session.ac = '/'; }, zel: [{ fill: ['.ds-g3-comp textarea', '/'] }] },
  { id: 'composer-autocomplete-mention', ref: (r) => { r.session.ac = '@'; }, zel: [{ fill: ['.ds-g3-comp textarea', '@'] }] },
  { id: 'composer-autocomplete-emoji', ref: (r) => { r.session.ac = ':jo'; }, zel: [{ fill: ['.ds-g3-comp textarea', ':jo'] }] },
  { id: 'split-view', vp: 'desktop', ref: (r) => { r.session.split = 'gaming'; }, refSteps: [{ js: "document.querySelector('.msgs').scrollTop=0" }], zel: [{ js: "const s=document.querySelector('.ds-g3-splitsel');s.value=[...s.options].find(o=>/gaming/.test(o.text)).value;s.dispatchEvent(new Event('change',{bubbles:true}))" }] },
  { id: 'mobile-drawer', vp: 'mobile', ref: (r) => { r.session.drawer = true; }, zel: [{ signal: ['mobileMenuOpen', true] }] },
  { id: 'create-server-modal', ref: (r) => { r.session.srvModal = 'create'; }, zel: [{ click: '.ca-rail-server-add', rail: true }] },
  { id: 'discover-servers-modal', ref: (r) => { listedServers(r); r.session.srvModal = 'discover'; }, zel: [{ click: '.ca-rail-server-explore', rail: true }] },
  { id: 'server-menu-member', ref: (r, { mobile }) => { r.session.serverMenu = true; if (mobile) r.session.drawer = true; }, zel: [{ click: '.ca-rail-public', rail: true }, { js: PUBLIC_AS_GAME3, wait: 700 }, { click: SHEAD, rail: true }] },
  { id: 'server-menu-owner', ref: (r, { mobile }) => { ownServer(r); r.session.serverMenu = true; if (mobile) r.session.drawer = true; }, zel: [{ click: SHEAD, rail: true }] },
  { id: 'server-settings', ref: (r) => { ownServer(r); r.session.srvModal = 'settings'; }, zel: [{ click: SHEAD, rail: true }, MENU('Server Settings'), { pane: 'Overview', optional: true }] },
  ...settingsScreens,
  { id: 'voice-room', ref: (r) => { r.player.state.vc = 'lounge'; r.session.view = 'voice'; for (const p of r.ctx.place.players) if (p.userId !== uid('jun')) p.state.vc = 'lounge'; }, zel: [ch('lounge'), { js: '0', wait: 1800 }, { js: `const L=window.state.voiceParticipants||[];window.state.micMuted=false;window.state.voiceParticipants=[...L.map((p)=>({...p,isMuted:false})),{key:'nostr-mira',identity:'${pubkeyOf('mira')}',name:'Mira',isLocal:false,isMuted:false,hasVideo:false,connectionQuality:'good'}]` }] },
];
