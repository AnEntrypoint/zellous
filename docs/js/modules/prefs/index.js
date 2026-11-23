import { registerModule } from '../registry.js';

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
  { key: 'devevents', signal: 'pref_devevents', store: 'zellous-pref-devevents', def: false, label: 'Event log', hint: 'the events in this channel, with a title filter' },
  { key: 'devtraffic', signal: 'pref_devtraffic', store: 'zellous-pref-devtraffic', def: false, label: 'Relay message counters', hint: 'messages received and sent per relay' },
  { key: 'devinspect', signal: 'pref_devinspect', store: 'zellous-pref-devinspect', def: false, label: 'Channel and member inspector', hint: 'channel and member ids with their status' },
];

const PREF_GROUP = { rolecolors: 'access', motion: 'access', ulinks: 'access', sound: 'notif', mentionsonly: 'notif', vcsounds: 'voice', sbsounds: 'voice', embeds: 'media', jumbo: 'media', spoilers: 'media', h24: 'lang', devmode: 'adv', devevents: 'adv', devinspect: 'adv', devtraffic: 'adv' };

const ROOT_CLASS = { motion: 'zellous-motion-reduced', ulinks: 'zellous-ulinks', spoilers: 'zellous-spoilers' };
const rootClassPrefs = PREFS.filter((p) => ROOT_CLASS[p.key]);

const MUTED_KEY = 'zellous-muted-channels';

registerModule({
  id: 'prefs', kind: 'service',
  setup(ctx) {
    const { S, v, call, persistBool, state } = ctx;
    const storeText = (signal, key, text) => { if (S[signal]) S[signal].value = text; localStorage.setItem(key, text); };
    const applyRootClass = (key, on) => document.documentElement.classList.toggle(ROOT_CLASS[key], !!on);
    for (const p of rootClassPrefs) applyRootClass(p.key, v(p.signal, false));
    const setMuted = (next) => { S.mutedChannels.value = next; localStorage.setItem(MUTED_KEY, JSON.stringify(next)); };
    const toggleIn = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

    return {
      snapshot: () => ({
        gamePrefOpen: v('gamePrefOpen', false),
        gamePrefCompact: !!v('pref_compact', false),
        devMode: !!v('pref_devmode', false),
        h24: !!v('pref_h24', false),
        jumbo: !!v('pref_jumbo', true),
        previews: !!v('messagePreviewEnabled', true),
        embeds: !!v('pref_embeds', true),
        vcsounds: !!v('pref_vcsounds', true),
        gamePrefToggles: PREFS.filter((p) => !p.radio && PREF_GROUP[p.key]).map((p) => ({ key: p.key, label: p.label, hint: p.hint, checked: !!v(p.signal, p.def), group: PREF_GROUP[p.key] })),
        gamePrefKeywords: v('pref_kw', ''),
        gamePrefBanner: v('pref_banner', ''),
        gamePrefTab: v('gamePrefTab', 'account'),
        gamePrefName: (v('profilesVersion', 0), (state.nostrPubkey && ctx.chat) ? ctx.chat.resolveProfile(state.nostrPubkey) : 'You'),
        gamePrefServers: (v('servers', []) || []).length,
        gamePrefMuted: (v('mutedChannels', []) || []).map((id) => ({ id, name: ((v('channels', []) || []).find((c) => c && c.id === id) || { name: id }).name })),
        themePref: v('themePref', 'ink'),
        mutedChannel: (v('mutedChannels', []) || []).includes((v('currentChannel', null) || {}).id),
      }),
      actions: {
        openGamePrefs: () => call(() => { if (S.gamePrefOpen) S.gamePrefOpen.value = true; }),
        closeGamePrefs: () => call(() => { if (S.gamePrefOpen) S.gamePrefOpen.value = false; }),
        setGamePrefTab: (t) => call(() => { if (S.gamePrefTab) S.gamePrefTab.value = t; }),
        toggleMuteId: (id) => call(() => setMuted(toggleIn(S.mutedChannels.value || [], id))),
        toggleMuteChannel: () => call(() => { const cur = v('currentChannel', null); if (!cur || !S.mutedChannels) return; setMuted(toggleIn(S.mutedChannels.value || [], cur.id)); }),
        setGamePref: (key, val) => call(() => {
          if (key === 'kw') return storeText('pref_kw', 'zellous-pref-kw', String(val || '').slice(0, 200));
          if (key === 'banner') return storeText('pref_banner', 'zellous-pref-banner', String(val || ''));
          if (key === 'reset') {
            PREFS.forEach((p) => persistBool(p.signal, p.store, p.def));
            storeText('pref_kw', 'zellous-pref-kw', '');
            storeText('pref_banner', 'zellous-pref-banner', '');
            for (const p of rootClassPrefs) applyRootClass(p.key, false);
            return;
          }
          const p = PREFS.find((x) => x.key === key);
          if (p) persistBool(p.signal, p.store, val);
          if (ROOT_CLASS[key]) applyRootClass(key, val);
        }),
      },
    };
  },
});
