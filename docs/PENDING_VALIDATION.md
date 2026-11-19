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

Round 9 surface 2: rail. Design commit "feat(app): group the rail into information, text channels and voice channels".
- Reference: game-3 rail groups INFORMATION, TEXT CHANNELS, VOICE CHANNELS (scripts/ui.js).
- Data: s.channels typed announcement/page (information), text-like (text channels), voice/threaded (voice channels), each with its create button for managers.
- Witness (playwriter, zellous page, local dist via route): groups ["information","text channels","voice channels"]; channels ["announcements","general","General"]; create buttons [] (fresh profile is not a manager, so none shown, as intended).

## Round 10: message list and composer

10. Design SDK composer (design 05e9031, lanmower). src/components/chat/composer.js takes maxLength and onKeyDown; the textarea renders maxLength 190 and its keydown calls onKeyDown first. A chat-composer-count span shows the remaining characters once the text passes 150. src/community-app.js composerKey: Alt+ArrowUp/Down switches to the previous/next channel in rail order through A.switchChannel; ArrowUp on an empty composer loads the last own message into the input.
    - Witness (playwriter, local docs served on localhost:8790, design dist routed from the jsdelivr URL): appReady true, textarea maxlength "190", 160 characters typed gave counter "30", Alt+ArrowDown moved the header from "general" to "General".
    - ArrowUp edit-last not witnessed: a fresh profile has no own message to edit.
    - Enter-to-send, reply bar and the sticker picker: unchanged in this round (the sticker picker waits for the stickers kind).
    - Not pushed. Design 05e9031 is committed locally and goes to origin with the zellous commit in Phase B.

## Round 11: member list

11. Member list: no code change. The SDK renders the member list from zellous's memberCategories (docs/js/ui-voice.js categories(): role sections Owner, Admin, Moderator, Members, then Offline), toggled by toggleMembers.
    - Witness (playwriter, local docs on localhost:8791, design dist routed from the jsdelivr URL): appReady true, members aria-pressed "false" then "true" after one click, categories returned [Members (1 online), Offline (3)].
    - The first-run key notice had to be dismissed before the header button was clickable; that is the existing modal, not a change.
    - Dev server stopped by PID 2309004; port 8791 returns 000.

## Round 12: member list against game-3

12. Member list fixes (design commit, lanmower): src/components/community/presence.js MemberList headers read "Label (N)" (game-3 reads "Label — N"; an em dash is rejected by lint-glyphs, so the parenthesised count is used); MemberItem takes a suffix, rendered as a span with class cm-member-suffix.
13. Zellous (commit 327287f, lanmower): docs/js/ui-voice.js labels owner "Server Owner", member "Online" (game-3 Online catch-all), the owner row carries suffix "owner" and nameColor from ROLE_COLOR; docs/js/adapter/members.js hides the list in home and voice views, as game-3 does.
    - Witness (playwriter, local docs on localhost:8792, design dist routed from the jsdelivr URL): members aria-pressed "false" then "true"; section headers ["Online (1)", "Offline (3)"]; row 1 status class "cm-member-status online"; offline rows status class "cm-member-status" (no offline style); clicking row 2 opened a dialog reading "npub1mv5...ue9e offline".
    - Gaps left open: game-3 crown icon (no crown glyph in the SDK icon set, and glyphs are rejected in src); game-3 activity sub-line ("Playing <server>", custom status, voice, typing), zellous has no per-member activity data; game-3 offline row dimming (no offline style in the SDK); game-3 Apps bot row (zellous has no bot); game-3 invisible status (zellous has no invisible status).
    - Dev server stopped by PID 2331224; port 8792 returns 000.

## Round 13: voice view witness

13. Voice view (no code change this round; gap recorded).
    - Witness (playwriter, local docs on localhost:8793, design dist routed from the jsdelivr URL): clicking the VOICE CHANNELS General entry opened the voice view. Header "General", "2 connected", two participant tiles, "push to talk", "No microphone: listening only", buttons Unmute, Deafen, Voice settings, Leave voice. appReady true.
    - Gap against game-3 (scripts/ui.js lines 580-594): game-3's control bar has a text-channel link back to the channel (the zellous voice view has none), a mic-off mark on tiles (not witnessed: both tiles had no mic-off in the text read), and the radio and soundboard, which are blocked by the missing sound and radio data.
    - Dev server stopped by PID 2354487; port 8793 returns STOPPED
000.

## Round 14: voice view gaps closed

14. Design (lanmower): src/components/game3-room.js VoiceRoom marks a muted participant with the mic-off icon (aria-label muted) instead of the word; src/community-app.js voiceView adds a control row: "#<first text channel>" switches to that channel, Soundboard and Lofi radio are disabled with a title, and a note says zellous has no sound or radio data yet.
15. Zellous (lanmower): docs/js/adapter/voice.js passes muted from wireweave's isMuted.
    - Witness (playwriter, local docs on localhost:8794, design dist routed from the jsdelivr URL): three tiles; the local tile (PTT, muted) carries the mic-off mark, the other two do not. Extras: "#general" enabled; "Soundboard" and "Lofi radio" disabled with titles "No sound clips are available yet" and "No radio stream is available yet"; the note text is shown. Clicking "#general" moved the header to "general" and left the voice view (vx-view false).
    - Dev server stopped by PID 2378288; port 8794 returns STOPPED
000.

## Round 15: user panel level bar and the xp data

16. Design (lanmower): src/components/community/presence.js UserPanel takes level and xpPct and renders "Lv N" with a progressbar (fill width set through the element ref, not a style attribute, because lint-inline-styles caps those); src/community-app.js passes s.level and s.xpPct.
17. Zellous (lanmower): docs/js/adapter/members.js levelFor derives the xp from the loaded chat history: 10 xp per message whose userId is the signed-in pubkey, level = floor(sqrt(xp / 40)), progress between 40*n^2 and 40*(n+1)^2 (the same curve as game-3 scripts/lib/discord.js LEVEL and LEVEL_XP).
    - xp kind schema (as derived now): source is the kind-42 chat messages already on the relay; no published event. The published xp kind (game-3 awards xp from events) is deferred to the data layer.
    - Witness (playwriter, local docs on localhost:8795, design dist routed from the jsdelivr URL): appReady true; .cm-user-level text "Lv 0"; progressbar aria-valuenow "0"; fill width "0%". The increase path (own messages) is not witnessed: it needs a posted message, which is outward-facing and not done.
    - Dev server stopped by PID 2405361; port 8795 returns STOPPED
000.

## Round 16: events surface (read-only)

18. Events data kind: NIP-52 time-based calendar event, kind 31923, read only. Tags: e = the channel's hex id (SHA-256 of serverId + ':' + channelId, the same mapping wireweave's chat uses in src/chat.js hexChannelId), title, start (unix seconds), end (unix seconds, optional), location (optional). Read in docs/js/events-feed.js through window.nostrNet.subscribe with filter { kinds: [31923], '#e': [hex] }, and unsubscribed on close. Nothing is published; creating an event is not part of this round.
19. Design (lanmower): src/components/game3-social.js EventsList (empty state, rows with title, time, location and a LIVE mark while now is within start..end); src/community-app.js header button "events", and the events surface lists events from the last 3 hours, as game-3 does (scripts/ui.js line 515).
20. Zellous (lanmower): docs/js/events-feed.js; docs/js/adapter/game.js starts the subscription on openSurface('events') and stops it on closeSurface; docs/js/state.js channelEvents signal; docs/js/adapter/signals.js lists channelEvents.
    - Witness (playwriter, local docs on localhost:8796, design dist routed from the jsdelivr URL): appReady true; "events" header button opens the dialog labelled events with text "No events in this channel yet." and the Done button; page errors []. The list rows and LIVE mark are not witnessed, since no events exist and creating one is not approved.
    - Dev server stopped by PID 2434903; port 8796 returns STOPPED
000.
    - The list rows have no CSS yet (unstyled), recorded as a gap.

## Round 17: leaderboard

21. Leaderboard data: derived from the loaded channel history, the same xp rule as the user panel (10 xp per message, docs/js/xp.js leaderboardFor and progressFor, the game-3 LEVEL and LEVEL_XP curve). No published xp event exists yet; the published xp kind stays deferred to the data layer.
22. Design (lanmower): src/components/game3-social.js LeaderboardList (ordered rows with rank, name, level and xp; empty state); src/community-app.js header button "leaderboard" and the surface body.
23. Zellous (lanmower): docs/js/xp.js (shared xp curve and leaderboard), docs/js/adapter/members.js and docs/js/adapter/game.js use it; the leaderboard rows carry resolved names.
    - Witness (playwriter, local docs on localhost:8797, design dist routed from the jsdelivr URL): appReady true; the leaderboard dialog listed six rows from the loaded history, the top one "Lv 1, 140 xp", the rest "Lv 0" with 20 or 10 xp; page errors [].
    - Gap: the list covers only the loaded channel history (limit 50 per channel), not every message the relays hold.
    - Dev server stopped by PID 2452629; port 8797 returns STOPPED
000.

## Round 18: polls

24. Polls data: game-3 polls are chat messages in the 📊¦question¦option¦option form (scripts/lib/discord.js POLL, 2 to 5 options). Zellous reads them from the loaded channel history, with no new published kind: docs/js/polls.js pollsFor parses the same pattern, newest first.
25. Design (lanmower): src/components/game3-social.js PollList (question, author, numbered options, empty state); src/community-app.js header button "polls" and the surface body.
26. Zellous (lanmower): docs/js/polls.js; docs/js/adapter/game.js snapshot polls.
    - Votes: not counted. Game-3 counts votes per option; zellous has no vote message kind and voting would publish to the relays, which is not approved. The list shows the options without counts, and the empty state says so.
    - Witness (playwriter, local docs on localhost:8798, design dist routed from the jsdelivr URL): appReady true; the polls dialog text "No polls in this channel yet. Votes are not counted by this client yet."; page errors []. The pattern itself was checked with node: a string in the 📊 form matches (true).
    - Dev server stopped by PID 2477110; port 8798 returns STOPPED
000.

## Round 19: recap

27. Recap data: messages from other users in the loaded channel history, the newest unread count of them (window.nostrUnread.countFor for the current channel), newest first. No published kind; docs/js/recap.js recapFor.
28. Design (lanmower): src/components/game3-social.js RecapList (author name and text, text nodes only); src/community-app.js header button "recap" and the surface body.
29. Zellous (lanmower): docs/js/recap.js; docs/js/adapter/game.js snapshot recap with resolved names.
    - Gap: game-3 recap summarises what was missed; zellous has no last-read timestamp, so it lists the unread count from history, and an unread count of zero shows the empty state.
    - Witness (playwriter, local docs on localhost:8799, design dist routed from the jsdelivr URL): appReady true; the recap dialog text "Nothing new in this channel since you last read it."; zero items; page errors []. The non-empty path is not witnessed in this profile (no unread messages).
    - Dev server stopped by PID 2500517; port 8799 returns STOPPED
000.

## Round 20: reminders

30. Reminders data: a per-viewer list in localStorage under zellous-reminders, entries { id, text, at } (at in ms). Reading goes through docs/js/reminders.js remindersFor, which tolerates a missing or bad value. Nothing is published. Creating a reminder is not part of this round.
31. Design (lanmower): src/components/game3-social.js ReminderList; src/community-app.js header button "reminders" and the surface body.
32. Zellous (lanmower): docs/js/reminders.js; docs/js/adapter/game.js snapshot reminders.
    - Witness (playwriter, local docs on localhost:8800, design dist routed from the jsdelivr URL): appReady true; the reminders dialog text "No reminders set. Reminders are kept in this browser only."; page errors []. The populated list is not witnessed (no reminder exists, and creating one is not in this round).
    - Dev server stopped by PID 2524666; port 8800 returns STOPPED
000.

## Round 21: pins

33. Pins data: a kind-42 channel message carrying a t tag 'pinned' (wireweave's _eventToMsg keeps t tags as msg.tags). Read from the loaded history by docs/js/pins.js pinsFor, newest first. Nothing is published; pinning would publish a pin to the relays, which is not approved, so zellous has no way to create a pin yet.
34. Design (lanmower): src/components/game3-social.js PinList; src/community-app.js header button "pins" and the surface body.
35. Zellous (lanmower): docs/js/pins.js; docs/js/adapter/game.js snapshot pins with resolved names.
    - Witness (playwriter, local docs on localhost:8801, design dist routed from the jsdelivr URL): appReady true; the pins dialog text "No pinned messages in this channel. Pinning is not available yet: it would publish a pin to the relays."; page errors []. The populated path is not witnessed: no pinned message exists in the loaded history.
    - Dev server stopped by PID 2549711; port 8801 returns STOPPED
000.

## Round 22: rules and announcements

36. Rules data: channels of type 'page' from the current server's channel list (docs/js/rules.js rulesFor). The rules text is the page content, shown through the existing page view; this surface lists the rules pages. No published kind.
37. Announcements data: kind-42 messages in the loaded history carrying a t tag 'announcement' (zellous sends them with that tag, wireweave chat.js isAnnouncementPost), newest first (docs/js/announcements.js announcementsFor). No published kind is added.
38. Design (lanmower): src/components/game3-social.js RulesList and AnnouncementList; src/community-app.js header buttons "rules" and "announcements" and their surface bodies.
39. Zellous (lanmower): docs/js/rules.js, docs/js/announcements.js; docs/js/adapter/game.js snapshot rules and announcements with resolved names.
    - Witness (playwriter, local docs on localhost:8802, design dist routed from the jsdelivr URL): appReady true; rules dialog "This server has no rules page yet."; announcements dialog "No announcements in this channel yet."; page errors []. The populated paths are not witnessed: this server has no page channel and no announcement message in the loaded history.
    - Gap: game-3's rules and announcements text are static or Spawn-hosted content, not available to zellous, so the surfaces show zellous's own rules pages and announcement messages only.
    - Dev server stopped by PID 2572684; port 8802 returns STOPPED
000.

## Round 23: roles and pick-roles

40. Roles data: counts of the room members per role (owner, admin, moderator, member) from window.serverRoles.getRole for the current server, read from state.roomMembers (docs/js/roles.js rolesFor). No published kind.
41. Pick-roles: no data. Picking a role publishes a role change to the relays, which is not approved, so the surface shows only the honest empty state. No published kind is added.
42. Design (lanmower): src/components/game3-social.js RoleList; src/community-app.js header button "roles" (now the counts list) and "pick roles", and their surface bodies.
43. Zellous (lanmower): docs/js/roles.js; docs/js/adapter/game.js snapshot roles.
    - Witness (playwriter, local docs on localhost:8803, design dist routed from the jsdelivr URL): appReady true; roles dialog lists "Server Owner 0", "Admin 0", "Moderator 0", "Online 4"; pick-roles dialog reads "Picking a role publishes a role change to the relays, which this client does not do yet."; page errors [].
    - Dev server stopped by PID 2596935; port 8803 returns STOPPED
000.

## Round 24: discover

44. Discover data: the servers this client has joined (state.servers, read by the adapter as discoverServers). Game-3 lists every server in its world; zellous has no public directory, so the list is the joined servers only. No published kind.
45. Design (lanmower): src/components/game3-social.js DiscoverList (name and open or joined state); src/community-app.js discover surface uses it with the honest empty text about the missing directory.
46. Zellous (lanmower): docs/js/adapter/game.js snapshot discoverServers.
    - Witness (playwriter, local docs on localhost:8804, design dist routed from the jsdelivr URL): appReady true; discover dialog lists one row, "Zellous Public" with "open" (the current server); page errors [].
    - Gap: no join from discover (joining needs an invite; no directory exists), and member counts per server are not shown because only the current server's members are loaded.
    - Dev server stopped by PID 2624648; port 8804 returns STOPPED
000.

## Round 25: split view with a second channel feed

47. Split feed: a read-only subscription to the second text channel, kind 42 with '#e' set to the channel's hex id (SHA-256 of serverId + ':' + channelId, the same mapping as wireweave's chat.js), limit 50, newest last. docs/js/split-feed.js subscribeSplitMessages. Nothing is published; the split pane does not send.
48. Zellous: the second channel is the first text channel of the server that is not the current one (not voice, threaded, announcement or page). docs/js/adapter/game.js startSplit on openSurface('split'), stopped on close; state.js splitChannel and splitMessages; signals.js lists both.
49. Design (lanmower): src/components/game3-social.js SplitPane (channel title, messages with name and text, empty text); src/community-app.js split surface uses it.
    - Witness (playwriter, local docs on localhost:8805, design dist routed from the jsdelivr URL): appReady true; with the current channel "general", the split dialog shows "Split view needs a second text channel. This server has none besides the one you are in."; after switching to "announcements", split shows "#general" with 10 messages from the loaded history (for example "plain test message 2", "hello, is anyone here?"); page errors [].
    - Dev server stopped by PID 2645671; port 8805 returns STOPPED
000.
