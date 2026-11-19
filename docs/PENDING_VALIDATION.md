# Pending validation

Phase A changes, committed locally as lanmower, not yet pushed. Each entry names the commit and the witness that was observed.

## 1. Design SDK: voice room, catch-up button and preferences dialog (design 0ad20e7)

- src/community-app.js: the voice view lists participants with VoiceRoom; the topbar renders CatchUpButton when adapter.unreadTotal > 0 and adapter.markAllRead exists; a preferences link opens a Dialog built from GameSettingsSection and ToggleRow when adapter.openGamePrefs exists.
- src/components/game3-room.js: VoiceRoom renders its controls only when a handler is given.
- Witness: `node scripts/build.mjs` exit 0 (build log: no FAIL or violation lines). dist/247420.js rebuilt.

## 2. Zellous: unread catch-up and notifications dialog (zellous 7d87ad6)

- docs/js/adapter/game.js (new): snapshot { unreadTotal, gamePrefOpen, gamePrefToggles }; actions markAllRead, openGamePrefs, closeGamePrefs, setGamePref.
- docs/js/state.js: gamePrefOpen signal.
- docs/js/adapter/signals.js: gamePrefOpen added to SIGNALS.
- docs/js/nostr-adapter.js: game builder registered.
- Witness: `node --check docs/js/adapter/game.js` and `node --check docs/js/nostr-adapter.js` print nothing and exit 0.

## Not wired (open)

- Split view, roles and pick-roles, Discover modal layout, events, leaderboard, XP level bar, polls, away recap, invite card, sticker picker, soundboard, lofi radio, keyword alerts, server create form: no zellous state or action backs them yet. Components exist in the SDK but are not mounted.
