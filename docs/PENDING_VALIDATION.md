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

## Round 6: full GUI replacement with the game-3 site (blocked)

Scope requested: replace every part of zellous's GUI with the game-3 site and roll out all of its functionality, without Spawn-platform bits, using only the local source (/config/workspace/game-3: ui/, design.md, mods/, AGENTS.md) and the components in design.

Not witnessed: the signed-in state of the live game-3 site. No login link, token or account sign-in was requested for it, as instructed. Every reference fact below comes from the local source and the public page.

Blockers, with cause:

1. Architecture conflict. zellous's AGENTS.md says the anentrypoint-design SDK owns the whole app GUI and zellous is a thin consumer (mountCommunityApp composes every surface). Replacing the SDK-owned GUI with the game-3 HUD in zellous moves that ownership, so it needs an owner decision on where the replacement lives before any code change.
2. Source dependency. The game-3 HUD in scripts/ui.js (about 757 lines, inside a 135 KB file) renders through Spawn engine APIs (sendAction, world.state, ctx.spawn, Spawn chat scopes, NIP-style relays provided by the platform). It has no standalone data layer, so there is no zellous source for its events, XP and levels, polls, stickers, recaps, reminders, pins, rules, announcements, roles and pick-roles. Wiring them means defining new Nostr event kinds and a data model for each, which is a protocol design task, not a GUI change.
3. Media. Soundboard clips and lofi radio are /cdn names that only the Spawn CDN resolves; zellous cannot play them without bundling the audio, which the repo rules forbid for vendored art.
4. Already matched: text channels, DMs, voice rooms, members, profiles, statuses, reply, reactions, search, server create and menu, settings, Catch up, preferences. Honest empty states: discover, roles, split view. The gap list with causes is in the earlier Round 5 section.

Witness for this round: none beyond the Round 5 witness; no code was changed.

## Round 7: full replacement, status open

Decisions recorded: the replacement lives in the design SDK composition (mountCommunityApp); the data layer is built with Nostr kinds for events, XP and levels, polls, stickers, recaps, reminders, pins, rules, announcements, roles and pick-roles; media uses zellous's own clips or silent fallbacks; no Spawn CDN, no login link, token or sign-in for the live site. The signed-in state of the live site is not witnessed, by decision.

Status: open. No code for the replacement has been written yet in this round.

Plan, in order, each step committed as lanmower with a witness here:
1. Data schema: document one Nostr kind per area in this file (events, xp, polls, stickers, recaps, reminders, pins, rules, announcements, roles, pick-roles) with tags and content fields, and a parser per kind in docs/js/nostr-*.js.
2. Adapter builders: one docs/js/adapter/ builder per area reading the parsed state, with actions that publish the kind.
3. Design composition: one design component per game-3 surface (rail items, channel header, Catch up, Split, Events, Leaderboard, Polls, Stickers, Soundboard, Radio, Recap, Reminders, Pins, Rules, Announcements, Roles, Pick-roles, Discover, Preferences), mounted in mountCommunityApp.
4. Media: zellous-owned clips in docs/ or silent fallbacks, recorded with their source.
5. Witness: each surface on zellous with playwriter, outputs quoted here.

## Round 8: GUI replacement, surface by surface

1. Channel header (topbar replaced). Design commit: the feat(app) commit "replace the topbar with the game 3 channel header" (src/components/game3-header.js, src/community-app.js).
   - Reference: game-3 channel header in scripts/ui.js (channel name, topic, Catch up, Split, member toggle).
   - Data: s.currentChannel.name and type, s.unreadTotal, s.memberListOpen, s.servers and s.currentServerId, and ch.topic when present (zellous channels carry no topic, so none is shown).
   - Witness (playwriter, zellous page with the local design build served through a route, no push): appReady true, mounted true, oldTopbar false, header true, name 'general', buttons [home, servers, preferences, discover, roles, split view, members], members aria-pressed false then true after a click, discover panel opened with the surface class present, page errors [].
   - Signed-in state of the live site not witnessed; no login link or token used.

Round 8 status: channel header witnessed for render, panel buttons (discover opened and closed) and the members toggle. Catch up not witnessed: it renders only when there are unread messages, a fresh profile has none, and creating them would post to public relays, which this round does not do. Surfaces 2 onward (rail, message list and composer, member list, voice view, user panel and level bar, events, leaderboard, polls, recap, reminders, pins, rules, announcements, roles and pick-roles, Discover, preferences, split view) are not started. Nothing is pushed.

Round 9 step 1: rebase check. Zellous local commits 80548b5 and 44cab73 are ahead of origin/main f89fa0b with no origin-only commits, so no rebase or conflict resolution was needed. Design e2fdf0c is ahead of origin/main 28715f0 with no origin-only commits. Nothing is pushed.
