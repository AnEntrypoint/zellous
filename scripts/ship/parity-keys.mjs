export const RULES = {
  ref: [
    ['_skip', '.grp > div:has(> .av:only-child)'],
    ['_skip', '.grp.cont > div'],
    ['rail', '#dc > .rail'],
    ['sv-home', '#dc > .rail > .sv.dm'],
    ['rail-sep', '#dc > .rail > .sep'],
    ['sv-add', '#dc > .rail > .sv.add:not(.disc)'],
    ['sv-disc', '#dc > .rail > .sv.disc'],
    ['sv-server', '#dc > .rail > .sv'],
    ['side', '#dc > .side'],
    ['ch', '.chans > .ch'],
    ['cat', '.chans > .cat'],
    ['main', '#dc > .main'],
    ['smi', '.smenu > div'],
    ['smh', '.smenu > hr'],
    ['mhead-t', '.mhead > .t'],
    ['mhead-tp', '.mhead > .tp'],
    ['mentext', '.mebtn > div:not(.dot)'],
    ['rep', '.grp .rep'],
    ['head', '.grp > div:not(.av):not(.tx):not(.bar) > div:has(> .who):not(.tx):not(.av)'],
    ['col', '.grp > div:not(.av):not(.tx):not(.bar)'],
    ['mbody', '.mrow > div:not(.dot):not(.av)'],
    ['pagecol', '.body > .col'],
    ['me-n', '.me .n'],
    ['me-s', '.me .s'],
  ],
  zel: [
    ['rail', '.ca-rail-servers:not(.ds-g3-srvstrip *)'],
    ['sv-home', '.ca-rail-servers > .ca-rail-home'],
    ['rail-sep', '.ca-rail-servers > .ca-rail-sep'],
    ['sv-add', '.ca-rail-servers > .ca-rail-server-add'],
    ['sv-disc', '.ca-rail-servers > .ca-rail-server-explore'],
    ['sv-server', '.ca-rail-servers > a'],
    ['side', '.ca-rail-channels'],
    ['ch', '.chans > a:not(.ds-g3-shrow)'],
    ['cat', '.chans > .group-header'],
    ['main', '.ca-right'],
    ['smi', '.ds-g3-smenu > [role=menuitem]'],
    ['smh', '.ds-g3-smenu > hr'],
    ['mhead-t', '.ds-g3-header-name'],
    ['mhead-tp', '.ds-g3-header-topic'],
    ['me-n', '.ds-g3-men'],
    ['me-s', '.ds-g3-mes'],
  ],
};

export const ALIAS = {
  shead: 'shead', chans: 'chans', 'ds-g3-set-nav': 'nav', 'ds-g3-set-pane': 'pane', 'ds-g3-set-close': 'close',
  'ds-g3-pcard': 'card', 'ds-g3-pc-ban': 'ban', 'ds-g3-pc-cb': 'cb2', 'ds-g3-pc-inner': 'inner', 'ds-g3-pc-lbl': 'lbl', 'ds-g3-pc-val': 'val',
  'ds-g3-ac-h': 'h', 'ds-g3-ac-it': 'it', 'ds-g3-pop-wrap': 'pop', 'ds-g3-pop-h': null, 'ds-g3-pop-body': 'pl', 'ds-g3-dmav': 'av',
  'ds-g3-vbar-main': null, 'ds-g3-vbar-t': null, 'ds-g3-vbar-s': null, 'ds-g3-smenu-l': null, 'ds-g3-smenu-i': null, 'ds-g3-smenu-h': null,
  'ds-g3-tgl-label': null, 'ds-g3-tgl-sub': null, 'ds-g3-acct-note': null, 'ds-g3-file': null, 'ds-g3-fileinput': null,
  'ds-g3-acct-ban': 'ban', 'ds-g3-acct-row': 'row', 'ds-g3-acct-av': 'av', 'ds-g3-acct-id': null, 'ds-g3-acct-st': null,
  'glyph-page': 'em', 'glyph-announcement': 'em',
  'ds-g3-dico': 'dico', 'ds-g3-vtile': 'tile', 'ds-g3-vnm': 'nm', 'ds-g3-vmo': 'mo', 'ds-g3-vcbtn': 'cbtn', 'ds-g3-vchat': 'chat', 'ds-g3-vav': 'av', 'ds-g3-av': 'av', 'ds-g3-mav': 'av', 'ds-g3-meav': 'av',
  'ds-g3-medot': null, 'ds-g3-mdot': null, 'ds-g3-nmtxt': null, 'ds-g3-tx-wrap': null, 'ds-g3-welcome-big': null, 'ds-g3-header-glyph': null, 'ds-g3-header-actions': null, 'ds-g3-crown': null,
  'ds-g3-msub': 'sub', 'ds-g3-rep': 'rep', 'ds-g3-msuffix': 'tag',
  'ds-g3-msg': 'grp', 'ds-g3-day': 'div',
  'ds-g3-pollcard': 'poll', 'ds-g3-pollq': 'pq', 'ds-g3-pollo': 'po', 'ds-g3-pollf': 'pf', 'ds-g3-pollt': 'pt',
  'ds-g3-header': 'mhead', 'ca-right-body': 'body', chat: 'pagecol', 'chat-thread': 'msgs', 'chat-jump-latest': 'jump',
  'ds-g3-rail-lv': 'mi', 'ds-g3-mebtn': 'mebtn',
};

export const IGNORE = ['on', 'active', 'unread', 'cont', 'hov', 'ln', 'off', 'closed', 'muted', 'jumbo', 'mine', 'me-mention', 'open', 'rm', 'ul', 'sp', 'live', 'lit', 'red', 'talk', 'real', 'dead', 'ghost', 'big', 'dm', 'dot', 'add', 'disc', 'th-dark', 'th-ash', 'th-onyx', 'th-light'];

export const TAG_KEYED = ['i', 'svg', 'img', 'input', 'textarea', 'select', 'b', 'h1', 'h2', 'h3', 'h4', 'h6', 'p', 'code', 'a'];

export const MASK = {
  ref: ['.av', '.dico', '.stks', '.pics', 'img', '.sv:not(.dm):not(.add)'],
  zel: ['.ds-g3-av', '.ds-g3-mav', '.ds-g3-meav', '.ds-g3-vav', 'img', '.ca-rail-servers > a:not(.ca-rail-home):not(.ca-rail-server-add):not(.ca-rail-server-explore)'],
};

export const PURPOSE = [
  { id: 'spawn-catchup', note: 'Catch up and Catch me up (Spawn AI)', ref: '.aibtn', zel: null },
  { id: 'split-picker', note: 'zoom and language pickers', ref: '.langsel:not(.setm), .zooms', zel: '.ds-g3-langsel, .ds-g3-zooms' },
  { id: 'radio', note: 'radio is a synthesised loop', ref: '.radio-on, .vctl .chat:first-child', zel: null },
  { id: 'zellous-menu-surface', note: 'server menu rows for Roles, Announcements and Share a Terminal: zellous features game-3 does not have', ref: null, zel: '.ds-g3-smenu [data-surface]' },
  { id: 'zellous-discovery-link', note: 'Discovery and promotion entry inside Server Settings', ref: null, zel: '.ds-g3-srv-more' },
  { id: 'zellous-public-room', note: 'the public room every visitor joins (ZELLOUS_PUBLIC_SERVER_ID), a required presence in the server rail', ref: null, zel: '.ca-rail-servers > a.ca-rail-public' },
  { id: 'zellous-profile-extras', note: 'zellous-only settings content game-3 lacks: the Key and Security, Relays, Privacy, Data, Sync and Discovery panes and their nav items, and profile fields (website, links, location, birthday, banner type, server nickname and picture)', ref: null, zel: '.ds-g3-zx' },
  { id: 'zellous-camera', note: 'camera toggle in the voice controls: game-3 has no camera', ref: null, zel: '.ds-g3-vcbtn[title*="camera"]' },
  { id: 'dm-hover-bar', note: 'DM hover bars extra over game-3', ref: null, zel: '.ds-g3-dm .ds-g3-bar' },
];

export const PROPS = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'backgroundColor', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopColor', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius', 'gap', 'opacity', 'position', 'display', 'textAlign', 'textTransform', 'textDecorationLine', 'boxShadow'];
