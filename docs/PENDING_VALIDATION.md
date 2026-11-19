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

## Round 3

5. Design SDK, honest discover, roles and split-view surfaces (design: see git log for the commit, build exit 0).
   - src/community-app.js: topbar buttons discover, roles and split view open a Dialog; each shows an explicit empty state.
   - src/components/game3-social.js: ServerDiscover takes emptyText.
   - Witness: node scripts/build.mjs exit 0.
6. Zellous gameSurface signal and openSurface/closeSurface actions (zellous: see git log).
   - Witness: node --check docs/js/adapter/game.js and docs/js/state.js exit 0.
7. ServerCreateForm DOM-read change confirmed in design 44712fd (git show 44712fd:src/components/game3-room.js has data-color and reads the input from the form).

## Round 4 (live witness)

8. Design SDK types: ServerDiscover emptyText declaration committed (design: see git log, the chore(types) commit). Reason: the build regenerates types/components.d.ts, and the change adds the prop the Discover panel passes; committing keeps consumers' declarations in step with the bundle.
9. Live witness of the pinned design commit a18a18b with zellous js served from fdb371e:
   - Boot: appReady true, mounted true, topbar preferences, discover, roles, split view.
   - Discover: dialog 'discover', text 'This client has no public server directory yet...', focus on Done, Escape closes.
   - Roles: 'This client does not show or assign roles yet.', focus on Done, Escape closes.
   - Split view: 'Split view needs a second channel feed...', focus on Done, Escape closes.
   - Preferences: focus on Notifications, Space sets it false, Sound click stores zellous-sound '0', Escape closes.
   - Create server: real serverManager.create submitted; the dialog closed and the server appeared in the rail. The server is published on public relays and needs deleting by its owner.
   - Page errors: none; only external wss://relay.damus.io 503 handshakes.

## Round 5: reference parity inventory

Reference: https://www.spawn.co/@mrmustard/game-3@dev, captured in playwriter as a signed-in agent (login link). The HUD sits in iframe[data-spawn-kernel-frame] > iframe[data-tome-realm="game"].

Reference HUD text on the main view (innerText, 3862 chars): rail buttons Events, Leaderboard, lv 0; sections INFORMATION (rules, pick-roles, announcements), TEXT CHANNELS (general, gaming, memes, clips), VOICE CHANNELS (lounge, squad, late-night); a member list (zellous_builder Online); channel header "general / hang out, say hi" with Catch up and Split controls; messages with join lines, "Wave to say hi!", a bot line "GG ..., you just reached level 2!", and link embeds.

Interaction inventory from scripts/ui.js (sendAction names, ~55 distinct): server, pref, srvmodal, switcher, profile, status, more, voice, settings, reply, mailbox, dm, send, search, react, mutech, mic, lightbox, leaderboard, home, events, event, drawer, collapse, channel, view, stickers, split, settab, save, rxpick, pins, escape, catchup, ac, wave, vote, typing, translate, toast, statusmenu, sound, servermenu, roles, remind, recap, readall, radio, pin, picker, members, markunread, markch, aiclose.

Status per surface, with the cause for each gap:

- Present in zellous and matched in shape: text channels, DM mailbox (dm), voice rooms (voice), member list (members), profile card (profile), status menu (status), reply, react, search, server create (server), server list and menu (servermenu), settings popover (settings).
- Present now, honest: discover, roles, split view (empty states; no backing feed or role UI).
- Present now, real: Catch up (markAllRead over window.nostrUnread), preferences (notifications, preview, sound), create server (serverManager.create).
- Gap, no zellous backing (blocked): Events and event create/RSVP (event, events) because zellous has no event kind; Leaderboard and level bar (leaderboard, lv) because zellous has no XP events; polls (vote) because no poll message type; stickers (stickers, picker sticker tray) because no sticker catalogue; soundboard (sound) and lofi radio (radio) because the reference clips are /cdn names zellous cannot resolve; recap (recap) because no 'while you were away' source; reminders (remind) because no reminder store; pins (pins, pin) because no pin event; markunread (markunread, markch) because the unread store has no mark-unread; translate (translate) because no translation service; rxpick (rxpick) because reactions use the emoji picker only; mutech (mutech) because no mute store for channels; announcements, rules, pick-roles as pages (rules, pick-roles, announcements) because zellous channels use the announcement type and pages without the reference content.
- Blocker: the reference content (rules text, announcements, role lists, XP, events, polls) lives in the Spawn world state and is not exposed to zellous. No parity is possible without a data source; zellous has no fake data and will not synthesise it.

Witness for this round: the reference HUD text quoted above (playwriter, login link, innerText of the game frame).
