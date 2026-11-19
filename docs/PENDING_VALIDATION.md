# Pending validation

Changes committed locally as lanmower and pushed in Phase B. Each entry names its commits and the witness observed.

## Changes

1. Design SDK, preferences dialog and catch-up (design 0ad20e7, then fixes e40aa06, 2e30740, 25501f8). Witnessed live, see below.
2. Zellous unread catch-up and preferences state (zellous 7d87ad6). Witnessed live.
3. Design SDK, create-server dialog opened from the rail plus button (design 44712fd). ServerCreateForm reads its name and colour from the DOM on submit.
   - Witness: node scripts/build.mjs exit 0.
4. Zellous create-server state and action (zellous b556382): serverColors from AVATAR_COLORS, openServerCreate, closeServerCreate, createServer calling serverManager.create.
   - Witness: node --check docs/js/adapter/game.js and docs/js/state.js exit 0.

## API check

- serverManager.create(name, color) exists (docs/js/bridge/servers.js) and is what the legacy create modal calls.
- markAllRead: window.nostrUnread.markRead(id) and countsFor() exist (docs/js/bridge/unread.js).

## Open, not wired

- Split view: zellous loads one channel's messages at a time, so a second pane has no feed. Not mounted.
- Roles and pick-roles: roles are read and set through ww.roles (getRole, setRole) for admins, but no role-picking UI exists in zellous to back the component. Not mounted.
- Discover modal layout: zellous has no public server directory; only joined servers are known. Not mounted.
- Events, leaderboard, XP level bar, polls, away recap, invite card, sticker picker, soundboard, lofi radio, keyword alerts: no zellous state or action backs them. Not mounted.
