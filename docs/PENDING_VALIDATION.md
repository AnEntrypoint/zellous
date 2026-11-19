# Pending validation

Phase A changes were committed locally as lanmower. Phase B pushed them after witnessing the live page. Entries name the commits and the observed witness.

## Shipped and witnessed

1. Design SDK: voice room, unread catch-up button and preferences dialog (design 0ad20e7, then fixes e40aa06, 2e30740, 25501f8).
   - src/community-app.js: the voice view lists participants with VoiceRoom; the topbar shows CatchUpButton when unreadTotal > 0 and markAllRead exists; a 'preferences' button opens a Dialog of GameSettingsSection and ToggleRow.
   - src/components/game3-room.js: VoiceRoom renders controls only when a handler is given.
   - Fixes found in live witness: the trigger was inside a display:none nav (moved to a visible button); focus stayed on the trigger on open (now the first switch, after a task); a toggle dropped focus so Escape did nothing (focus re-applied after render); a Done button added.
   - Build witness: node scripts/build.mjs exit 0 on each commit.

2. Zellous: unread catch-up and notifications dialog (zellous 7d87ad6).
   - docs/js/adapter/game.js: snapshot { unreadTotal, gamePrefOpen, gamePrefToggles }; actions markAllRead, openGamePrefs, closeGamePrefs, setGamePref.
   - docs/js/state.js: gamePrefOpen signal; docs/js/adapter/signals.js: listed in SIGNALS; docs/js/nostr-adapter.js: builder registered.

Live witness (fresh browser context, design SDK pinned to 25501f8 through a request route, because jsdelivr @main still served the previous bundle):
- boot: appReady true, __communityAppMounted true, page errors 0, console errors 0.
- preferences button visible; dialog opens with focus on the Notifications switch.
- Space on the focused switch toggles Notifications to false and focus stays on it.
- Escape closes the dialog. Mouse click on Sound sets localStorage zellous-sound to '0' and aria-checked false.
- Done closes the dialog.
- Chat send: text typed in the composer and Enter pressed; the sent text is in the page body and the composer is cleared.
- Not witnessed: the catch-up button (no unread messages in the test profile); the voice room (no voice connection in the test).

## Not wired (open)

- Split view, roles and pick-roles, Discover modal layout, events, leaderboard, XP level bar, polls, away recap, invite card, sticker picker, soundboard, lofi radio, keyword alerts, server create form. Zellous has no state or action backing these, so the components exist in the SDK but are not mounted.
