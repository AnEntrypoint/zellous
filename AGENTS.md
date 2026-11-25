# AGENTS.md — Operating Guide for Coding Agents

For the architecture reference read `CLAUDE.md` first; this file adds operational discipline only.

## Repo shape

Static GH-Pages app under `docs/`. Protocol logic is **`wireweave`**, loaded from the `AnEntrypoint/wireweave` GitHub repo through jsdelivr's `/gh/` CDN and the injected importmap, **pinned to a commit SHA** (`docs/nostr-chat/index.html`). No vendored copy, no submodule, no npm/unpkg dependency. Window globals are published by `docs/js/bridge/*.js`, run in order by `docs/js/wireweave-bridge.js`. No backend and no build for the app; `flatspace.config.mjs` and `site/` only build the marketing landing into `dist/`.

## What to edit

| Goal | Edit here |
|---|---|
| UI render / layout for the whole app | the `anentrypoint-design` repo's `mountCommunityApp` (see GUI ownership); only `docs/js/sdk-command-palette.js` survives as a subtree mount |
| zellous-side actions and state feeding the SDK | `docs/js/adapter/*.js` and `docs/js/nostr-adapter.js` (adapter contract), `docs/js/ui-actions.js`, `docs/js/state.js`, `docs/css/zellous.css` |
| Protocol behaviour (Nostr events, voice signalling) | the `AnEntrypoint/wireweave` repo: push to `main`, then bump the pinned SHA in zellous at both sites (see the pin section). A wireweave push alone changes nothing in zellous. |
| Expose or rename a window global | `docs/js/bridge/*.js` (each `install*` publishes its globals; `docs/js/wireweave-bridge.js` mirrors them under `window.__zellous`) |
| Add a vendored dep (not wireweave) | `scripts/fetch-vendor.js`, then an importmap entry in the inline injector in `docs/nostr-chat/index.html` |
| Touch state | `docs/js/state.js` (single source of truth for signals) |
| Improve an SDK component | the `AnEntrypoint/design` repo: `src/components/*.js` and the cssPart (`community.css`, `editor-primitives.css`, `app-shell.css`, `community-app.css`); re-export from `src/components.js`; run `node scripts/build.mjs`; commit the rebuilt `dist/247420.{js,css}` and push to `main`. zellous loads it live, so there is no zellous commit (see Kit consumption). |
| Marketing landing | `docs/index.html` (live) and/or `site/` + `flatspace.config.mjs` (CI-built `dist/`) |

## wireweave is pinned to a commit on jsdelivr's `/gh/` CDN

The inline importmap injector in `docs/nostr-chat/index.html` maps the bare specifier `wireweave` to

`https://cdn.jsdelivr.net/gh/AnEntrypoint/wireweave@4508d66ff4cd3fde31959cc8b998810f367be321/src/index.js`

`docs/js/bridge/boot-status.js` does `await import('wireweave')` (its `loadProtocol()`, called from `docs/js/wireweave-bridge.js`), and the bridge calls `mod.createWireweave({...})`. `package.json` carries no `wireweave` entry.

**The entry is pinned to a commit SHA, not `@main`.** A mixed-version jsdelivr tree (wireweave `src/` files resolved from different commits) broke boot; the pin makes the loaded tree one fixed commit. A wireweave push does not change zellous until zellous bumps the pin.

Both pin sites must move together:
- `docs/nostr-chat/index.html`: the `wireweave:` entry of the injector's `imports` map.
- `scripts/dev-server.mjs`: `CDN_WIREWEAVE`, which `npm run dev:local` rewrites to the sibling checkout.

**Bump procedure:**
1. Commit and push `AnEntrypoint/wireweave` to `main`; take the full 40-character SHA.
2. Replace the SHA at both sites. Confirm with a codesearch literal for `wireweave@` that the SHA appears only at those sites and in the documentation that quotes it (`README.md`, this file).
3. Re-verify boot against the production CDN path (not `--local`) in a fresh browser session with an empty HTTP cache: `window.appReady===true`, zero console errors (Google Fonts failures excepted), `window.__boot` not in the failed state.
4. Commit the bump in zellous.

**Tradeoffs.** Boot depends on `cdn.jsdelivr.net` being reachable. If the protocol layer fails to load, `boot-status.js` calls `window.__boot?.fail(...)` and the bridge rethrows; wireweave is the whole protocol layer, so there is no degraded mode. To test an unpinned or local wireweave, run `npm run dev:local`, which repoints the importmap at `/config/workspace/wireweave`.

wireweave takes its dependencies by injection (`createWireweave({ nostrTools, xstate, storage, ... })`; `NostrAuth` throws `nostrTools required`), and every module under its `src/` imports only relative siblings. The CDN entry therefore emits no bare specifier; `nostr-tools` and `xstate` keep their local `../vendor/` entries.

## GUI ownership: the SDK owns the whole app

The chat and community GUI lives in `anentrypoint-design`. Its `src/community-app.js` exports `mountCommunityApp(root, adapter)`, which composes every surface (topbar, rail, chat body, member list, voice view, user panel, and all overlays) and wires them to an injected adapter. It is barrel-exported as `window.__sdk.C.mountCommunityApp` and styled by the `community-app.css` cssPart. The adapter fields are documented in the design repo's `AGENTS.md`; a reference kit with a mock adapter is at `ui_kits/community-app/` in that repo.

**zellous is a thin consumer.** `docs/js/nostr-adapter.js` builds the adapter `{get()->snapshot, subscribe(cb), actions, helpers}` from one builder per surface in `docs/js/adapter/` (`signals`, `call`, `theme`, `frame`, `rail`, `chat`, `dm`, `members`, `voice`, `settings`, `overlays`, `session`), then calls `mountCommunityApp(#app, adapter)`. The builders read `window.stateSignals` and the feature-module actions. `subscribe` registers a `window.__effect` (set in `docs/nostr-chat/index.html`) over the reactive signals. The overlay globals `__contextMenu`, `__emojiPicker` and `__commandPalette` are re-exposed from the returned `app.api`. Of the old subtree mounts only `docs/js/sdk-command-palette.js` remains, still listed in `index.html`'s `scripts[]`.

To add a surface: compose it in `mountCommunityApp` reading from the adapter, add the adapter field, and map it in the matching `docs/js/adapter/*.js` builder. The DM home is `docs/js/adapter/dm.js` (`dmConversations`); display-name editing goes through `setDisplayName` in `docs/js/bridge/auth.js`.

**Final cleanup deferred** (high blast radius; wait until every surface is migrated): deleting `docs/css/zellous.css`, and switching from subtree mounts to a top-level `mount(#app)`. Until then `zellous.css` co-exists with the SDK's `community.css`; the SDK's `cm-*` classes do not collide with zellous's names.

If you find yourself editing anything under `docs/vendor/`, stop: it is a third-party drop. Protocol behaviour changes belong in the `wireweave` sibling repo (`../wireweave`), consumed over CDN at the pinned SHA, not vendored.

## Verification (live runs only)

No hard-coded validations and no test files. Verify behaviour by running the real system and reading the observed output. Do not add scripts or CI jobs that encode pass/fail checks.

- Live browser checks use the gm `crawl` verb with `engine=cdp`. The body is plain text: first line `engine=cdp`, then `url=<absolute URL>`, `wait=<ms>` (about 6000 for the app to boot), and `eval=<js>` (the value is returned). Example: `engine=cdp\nurl=https://anentrypoint.github.io/zellous/nostr-chat/\nwait=6000\neval=JSON.stringify({appReady: window.appReady})`.
- Parse-check a file with `node --check <file>`.
- Report what you observed, with the command and its output. Do not summarise a result you did not see.
- The legacy hidden auth modal in `docs/nostr-chat/index.html` still has a `.modal-btn.danger` "Logout" button (`#nostrLogoutBtn`), so selectors for the `ui.confirm` dialog must be scoped to `[role=alertdialog]`.
- Chat history loads with `limit: 50` and no `since`; the live subscription starts at `since: now`. A message published with a back-dated `created_at` is visible only after a reload, so account for that when probing anything time-based.
- Not witnessed by any agent; needs a human on real hardware: iOS Safari safe-area and zoom, the on-screen keyboard, landscape on a notched iPhone, fling-scroll, long-press and swipe on message actions, and the left-edge drawer swipe. Say so in any report about mobile behaviour.

Deploy runs on every push to `main` (`.github/workflows/gh-pages.yml`). It is the only workflow; there is no CI validation job.

## Game-3 parity: where it stands (closing state, ledger entries 188 to 198)

The interface is a port of game-3 (`/config/workspace/game-3/scripts/ui.js`) minus Spawn and savi. Every surface listed in entry 198 was compared at 1440x900 and 390x844; the ledger holds each witness. To continue:
- Known and left on purpose: the Spawn 50 px chrome reservation, Spawn wording, Catch up and Catch me up, the language and zoom pickers, DM hover bars (extra over game-3), own-name colour #5865f2, the home-mode quick switcher listing only servers visited in the session, the radio being a synthesised loop (game-3's radio mp3 is a Spawn-hosted CDN asset, so it is a Spawn part).

## Account configuration (ledger entry 199)

The settings panes My Account, Profiles, Key & Security, Relays, Privacy, Data and Sync are `design/src/components/game3-account.js`, fed by `docs/js/adapter/account.js` (snapshot `account`, `avatars`, `profileMeta`; actions `account*`) over `docs/js/bridge/account.js` (`window.nostrAccount`, image resize, generated avatar, preference sync IO) over wireweave `src/account.js` (`ww.account`). Public fields go to kind 0, private ones to a NIP-44 self-encrypted kind 30078 (d `zellous-account:self`), relays to kind 10002. Avatars reach every surface through the registry in `game3-hue.js` (`game3SetAvatars`, set at the top of each render): pass the pubkey as the second argument of `game3AvatarBg` and `game3AvInitial`. NIP-46 (wireweave `src/remote-signer.js`, session in `zn_bunker`, vendored `nostr-tools/nip46` and `qrcode-generator`), DM read receipts (kind 7 rumor tagged zellous-read, off by default) and the nickname look-alike warning are built (entry 200); a nickname look-alike is warned about, not blocked. When witnessing, use the local relay: a call to `account.resetRelays()` in node reaches real public relays.

The bottom-left user panel (`design/src/components/game3-user.js`, `game3-usermenus.js`, wiring in `design/src/community-app/user-panel.js`) holds the avatar menu, inline rename, status menu with expiry presets, the account menu and the Set up your profile modal (entry 201). Stored identities live in `zn_identities`, setup state in `zellous-setup`. Tap targets: a clickable element directly above a small one steals touch taps, so every small control needs its own handler.

## Ship gate (`scripts/ship/`)

Tooling, not tests: `sh scripts/ship/ship.sh "<message>"` is the only way to push a design and zellous change together.
- `lint.sh`: copies design `src`, zellous `modules`, `bridge`, `adapter`, `nostr-adapter.js` and wireweave `src` into a temp directory and runs eslint 9 with only `no-undef` (`eslint.config.mjs`; classic globals `state`, `ui`, `chat`, `config`, `_a11yPersistentModal` are declared there). A name the page does not have fails the ship; a missing eslint report fails it too. Sibling repos are `../design` and `../wireweave`, or `DESIGN_DIR` and `WIREWEAVE_DIR`.
- `kinds.mjs`: serves `docs/` locally against a wireweave `EphemeralRelay`, creates a throwaway server and posts a plain message, sticker, poll, link, Sharesies invite and server invite; every kind must render and the page must raise no error. It never touches a public relay. `CHROME_EXE` overrides the browser.
- `isolation.mjs`: server isolation gate. Static part: no `serverId || 'default'` fallback and no one-argument `hexChannelId(` anywhere in wireweave `src`, zellous `docs/js` or design `src`. Live part, on the local relay with a server `hi` (A owner, B member) and the public room (C): text, poll, reaction and pin posted in either room never appear in the other, across a server switch, rapid switching and reloads; a send with no server selected publishes nothing; every kind 42 on the relay is addressed to `sha256(serverId + ':' + channel)` of a real server and none to the default room. `WIREWEAVE_DIR=<export of an older wireweave>` makes the live part run against that code (red check, ledger 228: the pre-fix code fails four checks). Room ids need a server id: wireweave `src/channel-hex.js` (`hexChannelId`, `roomId`, `requireScope`) throws without one, and `chat.send` emits `send-blocked` reason `no-server`.
- `redraw.mjs`: boots the local rig with two identities, a fake microphone (Chromium fake-device flags and a generated wav) and a MutationObserver plus node-identity probe per surface (rail, channel list, voice bar, user panel, member list, messages, composer, settings, pickers). It measures idle, text channel, settings open, picker open, voice room and voice thread, then 200 real mouse down and up clicks (20 ms apart) on sidebar items while the voice room is live and its mute and speaking indicators flip 3 times a second. It exits 1 when a sidebar surface exceeds 1 mutation per second idle (8 live, attribute edits only), when any sidebar node is removed or replaced, or when fewer than 200 clicks land. High-frequency data stays out of the full render: `voiceSpeaking` is its own signal written at most every 250 ms, `voiceParticipants` is written only when the participant structure changes, the render effect in `docs/js/adapter/signals.js` coalesces writes into one render per frame, and design's vendored webjsx keeps unkeyed siblings of keyed nodes (a mix rebuilt them on every render). `REDRAW_MIC=flap` drives a gated, flapping microphone; `REDRAW_IDLE_BUDGET` and `REDRAW_LIVE_BUDGET` override the budgets; `REDRAW_DEBUG=1` prints signal writes and removed nodes.
- `tombstone.mjs`: opt-in witness for Delete Server for everyone on the local relay: owner, member and Discover viewer; the tombstone event shape, the server vanishing live and after reload, sends refused with `server-deleted`, join throwing, the Discover listing filtered, the invite card showing `Server deleted`, and an admin forgery staying inert. Prints `TOMBSTONE_OK`. `sweep.mjs` entries may carry `keep: true` to leave the surface open after its last path (the delete dialog is covered by this witness).
- `sweep.mjs`: starts the dev server with local deps and an `EphemeralRelay` on free ports, creates a throwaway server, then for every dialog, modal, popover, menu, picker, settings pane and legacy modal opens it through its real opener and takes each cancel path: every Cancel, Close, Discard, Done, Back and X control by click and by Enter at 1440x900 and by tap at 390x844, Escape, and a scrim click (outside click for non-modal popovers). It prints a table of surface, vp, control, path and result and exits 1 when a path leaves the surface open, leaves a scrim or backdrop behind, keeps an edited draft, or does not return focus to the opener; a `Back` control must change the view without closing. `SWEEP_ONLY=<regex>` narrows surfaces, `SWEEP_VP=desktop|mobile` narrows viewports, `SWEEP_WORKERS` sets pages per viewport. To cover a new surface add one entry to `SURFACES` (open steps, root selector, modal or not, focus selector, optional draft input). The mobile run is an emulated viewport with touch events, not real hardware.
- `ship.sh`: lint, kinds, sweep, push design, wait for jsdelivr to serve the design and wireweave SHAs, bump the design pin in `docs/nostr-chat/index.html`, push zellous, poll the deployed page for the new SHA (one workflow re-dispatch), then `live.mjs` boots the deployed page and requires `appReady`, a module list and no page error.
- Red check, witnessed in entry 215: a module containing `notDefinedAnywhere` makes `lint.sh` exit 1 naming the file and line; removing it returns `LINT_OK`.

## Modules (registry and contract)

A module is one named unit that may have three halves sharing an id: wireweave `src/modules/<id>.js` (protocol, `registerProtocol`), zellous `docs/js/modules/<id>/index.js` (behaviour, state, actions, `registerModule`) and design `src/modules/<id>/index.js` (components, design `registerModule`). Each repo has one `modules/index.js` listing its modules; adding one is its own directory plus one import line per repo.

Manifest: `{ id, kind, <kind>: {...}, setup(ctx) -> { snapshot, actions } }`. Ids are lowercase letters, digits and dashes and unique; a bad or duplicate manifest throws naming the module. design `package.json` lists `./src/modules/**/*.js` in `sideEffects` because registration happens on import.
- design `channelType`: `{ type, label, icon, railGroup, headerSub, searchGlyph, railIcon, welcomeGlyph, traits, body({ s, A, ch, views }) }`; omit `body` for the chat view. `surface`: `{ id, channelName, channelType, icon, placement: 'modal' | 'popover', title, head(ctx), rail: { order, row(ctx) }, body(ctx) }`; `placement` is what makes `openSurface(id)` render. `settingsPane`: `{ id, label, group, order, mount(ctx) }`. `messageKind`: `match(m)` plus `mount(ctx)` (replaces the row, first match) or `props(ctx)` (adds Game3Message props, every match). `popover` and `railSection`: `mount(ctx)`.
- zellous `channelType`: `{ type, label, searchGlyph, createOption, traits, onOpen(channel, ctx) }`; traits: `inRail`, `history`, `composer`, `split`, `defaultOpen`, `members`, `voice`, `threadParent`, `forumPosts`, `pageData`. A `service` module's `setup(ctx)` may create signals with `ctx.signal(name, initial)`; the adapter merges its `{ snapshot, actions }`.
- `ctx` is built in `docs/js/bridge/modules.js`: `ww`, `state`, `S`, `v`, `call`, `persistBool`, `trait`, `guard`, `toast(message, ms)`, `hooks.on/emit` (`surface:open:<name>`, `surface:close`), `ready`, `nameOf`, `currentChannel`, `goToChannel`, `avatarColors`, `inspect` and lazy getters for `chat`, `dm`, `forum`, `voice`, `unread`, `pins`, `events`, `polls`, `selfRoles`, `presence`, `membership`, `account`, `servers`. Modules read no `window.X`; classic scripts use `window.zModules`.
- Rules: nothing outside the registry modules switches on a channel kind (`grep -rn "type === '\(text\|voice\|forum\|threaded\|announcement\|page\)'"` over design `src` and zellous `docs/js`, minus the modules directories, must print nothing); a module keeps its state in its own signals and its CSS with it.

Registered modules, zellous (25, from `window.zModules.moduleList()`):
- channelType: `type-text`, `type-announcement`, `type-voice`, `type-threaded`, `type-forum`, `type-page` (the built-in channel kinds); `hello-room` (documented toy, copy it to start).
- service: `prefs` (settings toggles, mute), `devpanel` (developer info, local reset), `presence` (own status), `soundboard`, `xp` (level, leaderboard), `surfaces` (open and close surfaces), `events`, `split`, `pins` (pins and announcements), `polls`, `selfroles` (rules and roles), `inbox` (unread, saved, mentions, search), `servers` (create, discover, invites, leave), `servers-discovery` (Discovery settings pane data, promote, remove, listings), `sharesies` (live terminal sessions), `voice-thread`, `voice-room` (voice rooms and push to talk), `voice-rooms` (rail occupants, shared soundboard plays and the synthesised lofi radio over wireweave `voice-rooms`: one batched `#d` REQ per server, kind 30078 d `zellous-voice|sound|radio:<roomId>`; talking rings and the mic-off icon reach outsiders only as the explicit mute flag in presence), `share-web` (page and screen sharing).

Registered modules, design (from `src/modules/index.js`):
- channelType: `type-*` x6 (builtin), `hello-room`, `voice-thread`.
- surface: `surface-events`, `surface-leaderboard`, `surface-discover` (listings, search, tags, Join), `servers-discovery` (settingsPane, owner and admin only, requirements checklist, Promote and Remove; kind 30078, d `zellous-discover:<serverId>`, t `zellous-discover`, valid only when signed by a current admin), `surface-roles`, `surface-inbox`, `surface-pins`, `surface-recap`, `surface-announcements` (modal or popover bodies), `surface-rules`, `surface-pick-roles`, `surface-announcements-icon` (bound to channel names).
- settingsPane: `settings-account` (account, profile, security, relays, privacy, data, sync) and `settings-app` (appearance, access, voice, notif, media, lang, keys, adv), one pane per tab.
- messageKind: `message-poll`, `message-invite`, `message-sticker`, `message-unfurl`, `sharesies-card`.
- popover: `sharesies-panel`, `sharesies-share`, `share-web-panel`; railSection: `sharesies-rail`, `share-web-rail`.

## Things that look broken but aren't

- **No `<script type="importmap">` in raw HTML.** It is injected at runtime by an early classic script in `docs/nostr-chat/index.html`. Static greps miss it; the importmap is real.
- **`docs/js/state.js` imports `@preact/signals`.** This works because `state.js` is loaded with `await import('../js/state.js')` from the bootstrap module script, by which time the importmap is injected.
- **`site/theme.mjs` imports `anentrypoint-design` at build time** (its `installStyles()` call runs during the landing build) and embeds a browser importmap for it that loads from jsdelivr `@main`. Don't vendor it locally.
- **`dist/index.html` differs from `docs/index.html`.** `docs/` is the live GH-Pages source; `dist/` is the flatspace build artifact.
- **Repo-insight banners may flag `server.js`, SQL or hardcoded creds.** The summary indexer caches an old project shape. The tree has no server, SQL or embedded credentials; verify before "fixing".
- **No `wireweave` under `docs/vendor/`.** It is resolved live at the pinned SHA; a plain `git clone` boots with no submodule step.

## Rules

- **No backend.** Don't introduce a Node server, an Express route, a database, or anything that needs a process running. Voice and chat go through public Nostr relays. Storage is `localStorage` plus relay-side events.
- **No new `window.X`.** Add a manager via wireweave, expose it through `docs/js/bridge/*.js`, mirror under `window.__zellous`; shared helpers go on `window.__zellous.helpers`, the overlay api on `window.__zellous.overlays`. Don't sprinkle `window.foo = ...` in random modules.
- **No comments unless a future reader genuinely needs the *why*.** Don't narrate what the code already says.
- **No fallback / demo / mock modes.** If a probe needs real Nostr, run real Nostr.
- **No test files, anywhere.** Verification is live execution against the real page, never a test suite.
- **Importmap edits must update *the inline injector script*** in `docs/nostr-chat/index.html`, not a literal `<script type="importmap">` (there isn't one).

## Non-obvious technical caveats

**Uploads go through Blossom for every file type.** `chat.sendImage()` routes any file through `window.nostrMedia.sendMedia()` (wireweave `src/media.js`): a direct browser `PUT` to a public Blossom server with NIP-98-style kind:24242 auth. The returned URL is embedded in a kind:42 message. Blossom has no type restriction; the 20MB cap is enforced in `media.js` and surfaced as a toast. `ui-actions.js`'s `handleFileSelect` and `files.js`'s paste and drag-drop handlers all use this path.

**gm's `browser` verb: if it CDP-times-out silently, read the launch log first.** The launch code is `AnEntrypoint/agentplug`'s `crates/agentplug-host/src/browser.rs` (not in this checkout), compiled into `~/.gm-tools/agentplug-runner`. `launch_chrome()` captures Chrome's output to `browser-chrome-profile-<session>/chrome-launch.log` and retries once with `--no-sandbox` on a sandbox denial. To reproduce from source, clone `AnEntrypoint/gm` (its `agentplug` submodule is the real source), `cargo build --release -p agentplug-runner`, and dispatch `browser` directly.

**The `browser` verb takes a `viewport=WxH\n` prefix** for device-viewport checks (a real CDP device-metrics override with touch emulation). Stack the prefixes in this order: `timeout=`, then `viewport=`, then `url=`, then the script body; out of order corrupts the parse. `@scale` (`375x667@2`) sets the device scale factor; a trailing `!desktop` disables mobile and touch emulation. The script body must `return` its value from inside an `(async()=>{...})()` wrapper.

**Enforcement points.** Bans, timeouts and personal mutes are enforced in wireweave's `chat.js` (send and both subscriptions) and `mutes.js` (NIP-51 kind:10000). A personal mute filters only the viewer's own view; an admin ban is server-wide. Chat deletions (NIP-09 kind:5) are honoured only for the original author or an owner, admin or moderator.

**Voice-state signals must be seeded on `'connected'`.** A reactive signal derived from wireweave CustomEvents must be seeded in the `'connected'` handler, not only on `'participants'`: a self-only join never fires the change event. `docs/js/bridge/voice.js` seeds `state.voiceParticipants` for this reason; `docs/js/adapter/voice.js` derives the SDK's `speaking`/`color` fields from wireweave's raw `isSpeaking` shape.

**The relay pool schedules REQs, honours CLOSED and does NIP-42.** wireweave `src/relay-pool.js` keeps per-relay REQ slots (cap 40 until a relay answers too many, then its own limit), parks lower-priority REQs behind chat and DM, backs off a relay that answers `rate-limited` and re-REQs after `auth-required` once it has signed the AUTH challenge. Filter only on single-letter tags (`#e`, `#p`, `#d`, `#s`): relays refuse the rest. Never open a REQ per channel or per author; batch. `chat.send` returns a message with `send: {state, ok, failed, total, failures}` from the relays' OK acks.

**Voice joins listen-only when there is no microphone.** `connect()` in wireweave `src/voice.js` catches the `getUserMedia()` failure and joins with a `recvonly` transceiver; the `media-warning` event becomes a toast in `docs/js/bridge/voice.js`.

**Voice settings apply on the next join.** Mode, device, RNNoise, AutoGain, ForceTURN and bitrate live in `state.js`; `docs/js/adapter/voice.js` passes them to `docs/js/bridge/voice.js` (`setAudioConstraints`, `setForceRelay`). No live renegotiation happens.

When wiring any adapter boolean the SDK's own render logic branches on (e.g. `mobileMenuOpen`, `memberListOpen`), verify the exact field name against the live `247420.js` bundle (`curl` + grep) rather than assuming a same-named zellous action drives the right signal — it's easy to have an action that only touches dead legacy DOM while the real signal stays unwired.

**Legacy overlays and inputs need a position rule.** `#videoPlayback` (toggled by `webcam.js`), `#settingsPopover` (toggled by `ui-actions.toggleSettings`) and `#fileInput.hidden-input` are still wired to legacy controllers. `zellous.css` gives them `position:fixed; display:none` (overlays, z-index 2600) and a visually-hidden 1px clip. Any always-present overlay or trigger added to `index.html` needs a `position` and hidden-by-default rule, or it sits in normal flow and inflates `document.body.scrollHeight`. Because `html,body { overflow:hidden }` is set, that inflation shows no scrollbar; verify with `document.body.scrollHeight <= window.innerHeight` in a browser witness.

**Legacy context menus need `.open`.** `docs/js/nostr-channels-ui.js`'s `_mkMenu(id, x, y, html, onAction)` must set `className = 'context-menu open'`; `zellous.css` shows `.context-menu` only with `.open`. Check any new legacy overlay against its CSS default-hidden state the same way.

**Rail group create buttons.** `railPill` in the design repo's `src/community-app.js` renders flat rooms/voice/servers groups. A group's create button shows only when `adapter.get().canManage` and `adapter.actions.createChannel` exist; zellous wires `createChannel` to `channelManager.showCreateModal`. Drag and Alt+Arrow reorder run through the rail's `reorderChannel` adapter action (`docs/js/adapter/rail.js`).

**Off-canvas surfaces take `inert`, not `aria-hidden`.** The rail and the member list take `inert` while closed. webjsx assigns `el[key] = null` as an expando for keys not `in el`, so a nulled `aria-hidden` attribute stays in the DOM.

**The 640px drawer breakpoint is tracked in JS.** `docs/js/ui-shell.js` uses `matchMedia`, because crossing the breakpoint changes no signal and so triggers no re-render on its own.

**Untrusted Nostr text is escaped before `innerHTML`.** Server names and colours (kind:34550 tags) and channel type labels are attacker-controlled. Route them through `escHtml()` in `nostr-servers-ui.js` and `nostr-channels-ui.js`. Pages HTML goes through the SDK's DOMPurify-backed `sanitizeHtml()`; chat message text is inserted as text nodes.

**Overlay focus waits a task.** Move focus into a newly opened overlay with `setTimeout(fn, 0)`, not `queueMicrotask`: a microtask runs inside the triggering click, before the browser's focus-on-click settles, so focus can stay on the trigger and break Escape-to-close and the Tab trap. The design repo's overlays already follow this; keep new overlays on the same pattern.

**Disk-full destabilises the `browser` verb's chromium.** At 100% disk a `Write`/`Edit` can truncate a file to 0 bytes, and playwriter chromium can crash on long-busy operations. Recovery: (1) `git checkout -- <file>` for any truncated file; (2) close the browser session, stop only the orphaned `ms-playwright` chrome processes (match `*ms-playwright*` on the command line, never the user's personal Chrome), and `rm -rf .gm/browser-profile` if present (gitignored; recreated); (3) start a fresh session. Under disk pressure prefer short `waitForTimeout`-based witness bodies over long `waitForFunction` ones.

## Code invariants (from the comment sweep)

- `docs/js/bridge/chat.js`, `docs/js/bridge/forum.js`: `reactionsVersion` and `forumVersion` are listed in `SIGNALS` (`docs/js/adapter/signals.js`). `ui.render.all()` does not re-render the SDK, so a new reactive path must bump a listed signal.
- `docs/js/bridge/media.js`: call `window.chat.handleTextMessage`. The module-scope `chat` is `ww.chat` and lacks that method.
- `docs/js/bridge/network.js`, `docs/js/state.js`: `relayGrace` starts `true` to suppress the not-connected banner for 3s. The window is re-armed at `appReady`, since boot can take longer than 3s.
- Delete Server for everyone (wireweave `src/servers.js` `deleteForEveryone`, `scripts/ship/tombstone.mjs`): the owner signs a replaceable kind 34550 with tags `['d', dTag]`, `['name', name]`, `['deleted', '1']`, then best-effort kind 5s for their own kind 42 and kind 30078 (channels, roles, settings, selfroles, discover) events in it. The server id is `pubkey:dTag`, so only the owner's pubkey can produce the tombstone for that id; an admin's tombstone names a different id and is inert. A tombstone is terminal: servers drop the id from the list and joins, `chat.send` and `sendTo` emit `send-blocked` reason `server-deleted`, `join` throws, Discover filters the listing and the invite card renders `deleted`. Relays may keep old messages and the dialog says so.
- `docs/js/bridge/servers.js`: `ZELLOUS_PUBLIC_SERVER_ID` is the fixed room every visitor joins. Its zero pubkey has no private key, so the room has no owner or admin. Do not replace it with a generated key: chat and voice scope by SHA-256(serverId + channel).
- `docs/js/bridge/voice.js`: `applyOutputSettings()` must re-run over existing peer `<audio>` elements, because `onAudioTrack` sets volume and sink only at creation.
- `docs/js/bridge/voice.js`: `pruneVoiceMedia()` is the only per-peer cleanup. wireweave emits no per-peer-left event, so it diffs `[data-voice-peer]` elements on each `participants` event; `disconnected` sweeps all.
- `docs/js/bridge/voice.js`, `docs/js/adapter/voice.js`: `LEVEL_METER_CEILING` (0.35) is defined in both files and must stay equal. `vadThreshold` (0-1) is scaled by it before `setMicSensitivity`.
- `docs/js/bridge/auth.js`: both generate entry points go through `generateKeyWithConfirm`, which owns the discard confirmation and the backup prompt.
- `docs/js/moderation.js`: personal mute is offered regardless of `canManage`. Admin actions are hidden for `memberId === state.nostrPubkey`, since a self-ban or self-demote has no recovery path here.
- `docs/js/threads.js`: `openThread` is shared with ForumView. In a forum channel the id is a post id and routes to `selectForumPost`, never `switchChannel`.
- `docs/nostr-chat/index.html`, `docs/js/bridge/auth.js`: the first-run gate `if (!auth.init()) auth.generateKey()` mints a key without asking. wireweave `src/auth.js` stores it as plain hex under `zn_sk` in the injected storage.
- `docs/js/ui-actions.js`: drag handling calls `preventDefault` only when `dataTransfer.types` includes `Files`, so text and link drags keep browser behaviour.
- `docs/js/adapter/rail.js`: `goHome` must reset `currentServerId`, channels and chat, not only `homeMode`, which just drives the SDK highlight.
- `docs/js/adapter/rail.js`: `reorderChannel` republishes the destination category's full sibling list. wireweave `src/channels.js` `reorder(catId, ids)` assigns `position` and `categoryId` from it.
- `docs/js/adapter/voice.js`: the `volume` patch key comes from the SDK's `VoiceSettingsModal` (`design/src/components/voice/settings-modal.js`). Drop it and the master slider does nothing.
- `docs/js/adapter/theme.js`, `docs/js/state.js`: call `sdk.applyTheme` (zellous `light` maps to `paper`) so the SDK's own `247420:theme` self-apply cannot win the last write. The `zellous-theme` key is shared with the marketing landing (`docs/index.html`).
- `docs/js/adapter/chat.js`: wireweave `src/media.js` `sendMedia` has no announcement-admin check. The `composerLock` guard in `attachFiles` is the only gate on attachments.
- `docs/js/nostr-channels-ui.js`: every hand-rolled modal calls `_a11yModal` (Tab trap, Escape, focus restore). Toggled persistent modals use `_a11yPersistentModal`, as `docs/js/bridge/auth.js` does.
- `docs/js/nostr-channels-ui.js`: rename and delete are shown to owners only, which depends on wireweave `src/channels.js` keeping its `owner only` rejection.
- `docs/js/nostr-channels-ui.js`: the key-backup modal reveals the nsec only after an explicit click. Never render it on open.
- `docs/nostr-chat/index.html`: do not call `sdk.installStyles()`. It would stack a second kit CSS copy over the linked `247420.css` (`site/theme.mjs` calls it at build time, a different context).
- `docs/nostr-chat/index.html`: `s.async = false` keeps order within a phase; the loader awaits `window.__wireweaveReady` first, because other modules monkey-patch the bridge managers at evaluation time.
- `docs/nostr-chat/index.html`: `window.lk = null` (line 35) and the sibling placeholders break the no-new-`window.X` rule. They stay because removing them changes behaviour.

## Quick path map

```
docs/
  index.html                         marketing landing (live)
  nostr-chat/index.html              the app (live); holds the importmap injector
  js/                                first-party UI + bridge + state
    wireweave-bridge.js              ←  runs the bridge/*.js install modules in order, mirrors __zellous
    state.js                         ←  ESM, signals, window.state/config
    nostr-adapter.js                 ←  entry: builds the adapter from adapter/*.js, calls mountCommunityApp
    adapter/                         ←  one builder per SDK surface (rail, chat, dm, members, voice, ...)
    modules/                         ←  zellous modules, one directory each, listed in modules/index.js
    bridge/                          ←  install* modules that publish window globals (boot-status, chat, voice, ...)
    ui*.js                           ←  render
    *.js                             ←  feature scripts (files, webcam, moderation, threads, …)
  vendor/
    {preact,xstate,nostr-tools,…}    third-party
                                     (wireweave is NOT here -- pinned jsdelivr /gh/ URL in docs/nostr-chat/index.html)
  css/
    zellous.css                      token-only stylesheet
  msgpackr.min.js                    binary codec
site/                                flatspace inputs (theme + content)
flatspace.config.mjs                 build config (CI only)
dist/                                CI build artifact
scripts/fetch-vendor.js              vendored-dep fetcher
scripts/dev-server.mjs               static dev server; dev:local repoints deps at sibling checkouts
```

**How `docs/` reaches production.** `.github/workflows/gh-pages.yml` runs `npx --yes flatspace@1.0.23 build` and uploads `./dist` as the Pages artifact; Pages serves `dist/`, not `docs/`. `site/theme.mjs`'s `assets` map copies `docs/nostr-chat`, `docs/vendor`, `docs/css`, `docs/js` and `docs/msgpackr.min.js` into `dist/` verbatim; flatspace renders only the landing page from `site/content/`. Edit `docs/`; `dist/nostr-chat/` is a copy made on every deploy.

## Kit consumption (SDK JS + CSS, live from jsdelivr)

There is no local SDK copy and no vendored kit CSS; do not reintroduce one. Both pages link the bundled stylesheet `https://cdn.jsdelivr.net/gh/AnEntrypoint/design@<sha>/dist/247420.css`, and the importmap maps `anentrypoint-design` to the same `@<sha>/dist/247420.js`; both are pinned to a design commit in `docs/nostr-chat/index.html`, so a design push reaches zellous only when that SHA is bumped.

- The GitHub repo is `AnEntrypoint/design`; its npm package is `anentrypoint-design`. Don't confuse the two when building URLs.
- The bundle holds colors_and_type, app-shell, community, editor-primitives and community-app, all scoped under `.ds-247420`, which `<html class="ds-247420">` matches. Only `247420.css` is linked; the source cssParts are bundle inputs. A class missing from the bundle renders unstyled with no error, so confirm it is in `dist/247420.css` after an SDK change.
- To propagate an SDK change: run `node scripts/build.mjs` in the design repo, commit the rebuilt `dist/247420.{js,css}` (both are tracked; the design `.gitignore` excludes only `dist/index.html` and `dist/.nojekyll`), and push to `main`. zellous picks it up on the next page load.
- Tradeoff: boot depends on `cdn.jsdelivr.net`. The SDK import is in try/catch: on failure it sets `window.__sdk = null`, calls `window.__boot?.fail(...)` and rethrows, so the boot screen shows a message.
- `package.json` declares no `anentrypoint-design` entry. Only `site/theme.mjs` (the build-time landing) imports the SDK in Node; the app pages load it in the browser.
- `gmsniff` (vendors a kit subset, makes zero external-origin runtime fetches, must run air-gapped) and `agentgui` (vendors the built kit for offline operation) stay excluded from CDN loads. Do not convert either.

Two `design` CI gates apply before pushing an SDK change. The RTL lint (`scripts/lint-rtl-physical-properties.mjs`, run from `scripts/lint-css.mjs`) compares the physical-declaration count with the frozen baseline in `scripts/lint-rtl.baseline.json` (321): write logical properties (`inset-inline-*`, `margin-inline-start`, `text-align: end`), not `left`/`right`; `env(safe-area-inset-left)` names stay physical. Adding or renaming a component prop makes `docs/component-props.md` stale: run `node scripts/generate-component-docs.mjs` (plus `generate-component-types.mjs`, `generate-component-manifest.mjs`, `gen-exports.mjs`) and commit the result with the change.

**SDK components reach consumers as `C.X` only via the barrel.** `src/components.js` does `import * as components`, so a new export must be re-exported there. A consumer that polls for `!sdk.C.Foo` (see `docs/js/sdk-command-palette.js`) stays dead with no error, not a crash.

**Dev servers must send MIME types.** Browsers refuse ES modules served without `text/javascript`. `scripts/dev-server.mjs` sets them.

**Design tokens only.** `zellous.css` uses design tokens (`--bg`, `--fg`, `--accent`, `--green`, ...) from the bundled `247420.css` and defers layout to the SDK. Don't hardcode colours or add layout overrides for SDK classes. Overrides that match SDK selectors lose on specificity (an ink-theme token block beats a plain `:root` rule), so check computed values in a browser witness.

## Working discipline

- **Scripts are files, not heredocs.** Write a script with the gm `write_file` verb or Write, then run it in a separate short command. A long quoted heredoc that writes and runs a script in one call trips Claude Code's unparseable-command prompt and blocks the session. Scratch lives under the session scratchpad (`/config/tmp/claude-1000/-config-workspace-zellous/<session>/scratchpad`). Launch every browser with a fixed `--user-data-dir` under that scratchpad and reuse it; never scan `/config` with `find -name SingletonLock` (it saturated the CPU). `scripts/ship/*.mjs` use `chromium.launch`, which makes its own throwaway profile, so they need no scan.

- **Never post to the public room from a witness.** `ZELLOUS_PUBLIC_SERVER_ID` is a real shared room that strangers read. Witnesses that send messages, polls, reactions, joins or typing use a throwaway server (`window.__zellous.servers.create(name)` in a fresh context, a second identity joins with `servers.join(serverId,{name})`), or the local relay: `scripts/dev-server.mjs` plus a wireweave `EphemeralRelay` with a page init script that rewrites every `wss://` WebSocket to `ws://127.0.0.1:<port>` (an https page cannot reach a local ws relay, so serve `docs/` over http for that). Reading the public room (screenshots, computed styles) is fine; a DM between two throwaway keys is fine. Two earlier witnesses (a poll, its vote and a reaction) did post there and cannot be unposted.
- **Seeding history:** `chat.send` is limited to 5 per 10 s in the client, so seed long threads by signing kind 42 events (tag `['e', sha256(serverId+':'+channelId), '', 'root']`) and publishing them over one websocket to the local relay; history loads the newest 50 on open and the rest arrives by subscription.

- Never write `docs/PENDING_VALIDATION.md` from a paged read (gm `read_file` returns one page of a long file; writing it back truncated the ledger once). Append with a shell `cat >>`. `scripts/ship/prepush.sh` is the pre-push hook (install with `sh scripts/ship/install-hooks.sh`): it refuses a push where that file has fewer lines than the remote, and a push whose commit messages cite `ledger N` for an N with no `N. ` entry in the file.

- Under concurrent pushes to `design` or `zellous`, fetch, check the diff for disjoint changes and re-apply; don't force-push. Don't trust a `prd-resolve` success response alone under concurrent load; spot-check `.gm/prd.yml`.
- A fix round is evidence of progress, not convergence. Re-verify fixes with a reviewer that reads only the diffs.
- A "surely fine" mechanical deletion (a script tag and its module) still needs the live boot witness, not just a parse-check.

Dated audit narratives, fixed-bug notes and the learning-audit log are in `docs/notes/agents-history.md`.

## Voice thread VAD harness

The voice-thread clip filter lives in wireweave `src/vad/`: rnnoise voice score, 3-frame mean, hysteresis, hangover and pre-roll, a pitch tracker (`pitch.js`) and a clip filter (`clip-filter.js`), with every constant named in `src/vad/constants.js`. The wasm is vendored at `docs/vendor/rnnoise/` (see its README.txt). The corpora and harness live in the session scratchpad, not in a repo: `S=/config/tmp/claude-1000/-config-workspace-zellous/cca08832-1d92-43c1-a632-bec4782bec92/scratchpad/vad-harness`, `V=/config/tmp/claude-1000/-config-workspace-zellous/cca08832-1d92-43c1-a632-bec4782bec92/scratchpad/verify`, `B=/config/tmp/claude-1000/-config-workspace-zellous/cca08832-1d92-43c1-a632-bec4782bec92/scratchpad/blossom`.

Acceptance bar (owner, redefined): hot-mic classes (fan, breathing, keyboard, mouse click, silence and room tone) at most 2% kept, reported per class and pooled; speech at least 95% kept including short and noisy speech, scored on a split never scored before; cough passes as human sound and music is out of scope for a microphone (owner decision 2026-11-23): their numbers are reported, with no ceiling.

Committed constants: start 0.6, stop 0.4, voiced frame score 0.95, hangover 1000 ms, pre-roll 200 ms, minimum voiced 300 ms, minimum voiced ratio 0.5, minimum mean voiced energy -42 dB (denoised), minimum energy std 7 dB, at least 2.5 energy peaks per second, periodic ratio between 0.45 and 0.99, pitch std at most 9 semitones, no pitch-step rule, live minimum voiced 250 ms. `constants.js` sha256 `014cbc44f965c8373a3eef5cac0ac69dd2be367c5c4b152047830858599b66a9`.

Sensitivity profiles (wireweave `src/vad/constants.js`: `VAD_PROFILES`, `VAD_PROFILE_MEASURED`, `DEFAULT_VAD_PROFILE`; `createVoiceDetector({ profile })`). The voice-thread module stores the choice in localStorage `zellous-vad-profile` (default balanced) and a thread uses the profile in force when it was joined; the control is `design/src/components/voice/vad-profile.js` in the thread panel and the voice settings modal. Measured through `harness.mjs` cached features, tuning data (manifest to fresh5) with fresh6 as a descriptive look only (spent): strict (pitch std 8, floor -38 dB, voiced ratio 0.55) speech 91.2%, hot-mic 1.1% (fresh6 95.0 and 1.4); balanced (the constants below) 96.2 and 2.3 (95.0 and 2.9); lenient (pitch std 10, voiced ratio 0.4, 2 energy peaks per second) 97.5 and 3.2 (97.5 and 3.4). Hot-mic pools fan, breathing, keyboard, mouse click, silence, engine, wind and sneeze, excluding cough and music. Update the numbers in `VAD_PROFILE_MEASURED` whenever a profile moves.

Corpora (48 kHz mono, public datasets plus labelled synthetic classes; no speech synthesiser exists on this host, so all speech is real recorded read speech from LibriSpeech test-clean and dev-clean):
- `manifest.json` (422 clips) and `manifest-fresh1.json` to `manifest-fresh3.json` were used for tuning once scored. Constants were frozen before `manifest-fresh4.json` was built.
- `manifest-fresh4.json`, 460 clips, scored once: 50 speech, 25 short speech (0.7 to 1.2 s fragments), 25 noisy speech (5, 10 or 15 dB SNR over real ESC-50 noise or synthetic fan); 48 cough (CoughVid, user-labelled, unverified); 40 breathing (Coswara breathing recordings, label assumed); 40 keyboard and 40 mouse click (synthetic click bursts, because every ESC-50 clip of those classes was already used); 60 fan (40 real ESC-50 train, helicopter, chainsaw and wind clips as fan stand-ins, 20 synthetic); 92 music (40 Free Music Archive instrumental tracks with two 5 s windows each, plus 12 synthetic); 40 silence (20 digital, 20 synthetic room tone).
- Fresh4 result, the final scored numbers: speech 100% (50/50), short speech 96% (24/25), noisy speech 96% (24/25), pooled speech 98.0% (98/100). Hot-mic: fan 3.3% (2/60), breathing 0% (0/40), keyboard 0% (0/40), mouse click 0% (0/40), silence and room tone 0% (0/40), pooled 0.9% (2/220). Best effort: cough 25.0% (12/48), music 32.6% (30/92), both above the 10% ceiling. Fan alone misses 2% by 1.3 points (2 clips). Earlier fresh splits under the previous stricter pitch rules scored speech 97.0, 85.0, 90.0% and non-voice 5.4, 3.9, 3.3%.
- Hot-mic acceptance (ledger entry 221): `manifest-fresh5.json` is spent and counts as tuning data. `manifest-fresh6.json` is 349 non-synthetic FSD50K eval hot-mic clips plus 120 fresh LibriSpeech speech clips (60 clean, 30 short, 30 noisy over fresh5 noise), scored once with the constants frozen. Result: hot-mic pooled 10/349 = 2.9% kept (95% Wilson 1.6 to 5.2), fan 1/54, engine 4/60 (6.7%), breathing 3/77, wind 2/60, keyboard 0/98; speech 114/120 = 95.0% (clean 60/60, short 28/30, noisy 26/30). The 2.0% pooled and 5% per-class targets did not hold. Operating curve over `maxPitchStdSemitones` 10, 9, 8, 7, 6: tuning speech 96.3, 96.2, 94.8, 87.7, 70.2% with fresh5 hot kept 8, 7, 5, 4, 2 of 304; fresh6 speech 95.0, 95.0, 95.0, 90.0, 68.3% with hot kept 11, 10, 10, 8, 7 of 349. Reaching 2% with speech at 95% needs a new feature (spectral shape or harmonic-to-noise ratio), not another threshold. Fresh6 is spent.

- `manifest-fresh5.json`, 304 non-synthetic hot-mic clips from FSD50K dev (CC-BY, labels from FSD50K's ground truth, human-sound labels excluded, first chunk of each clip, 0.5 to 5 s), never used for tuning, scored once with the constants above frozen (wireweave `adfb5bd`, `src/vad/constants.js` sha256 `86adacb2`): breathing 4/67 kept (6.0%, 95% Wilson interval 2.3 to 14.4), engine 4/48 (8.3%, 3.3 to 19.6), wind 0/48 (0.0%, 0.0 to 7.4), keyboard 1/78 (1.3%, 0.2 to 6.9), fan 1/63 (1.6%, 0.3 to 8.5), pooled 10/304 (3.3%, 1.8 to 5.9). Not met: pooled and breathing and engine are over 2%. No non-synthetic mouse click or room tone existed in the sources reached, so those two classes stay at fresh4's synthetic numbers. Build with `fetch_fresh5.py <FSD50K dev.csv> <tmp dir>` then `build_fresh5.py` (pyarrow venv).

Commands (`node`, run anywhere):
- `node $S/harness.mjs --manifest=manifest-fresh4.json [--misses] [--config='{"minVoicedMs":400}']` prints keep rates per class from cached features; `--rescore` recomputes them through the real rnnoise wasm (minutes).
- `MANIFESTS=manifest.json,manifest-fresh1.json node $S/tune2.mjs '<json grid>' [top]` grid-searches filter constants and ranks by the acceptance bar; `SEG='{"hangoverMs":1500}'` changes segmentation constants.
- Rebuild corpora: `sh $S/fetch_raw.sh`, `python $S/fetch_fresh.py`, `fetch_fresh2.py`, `fetch_fresh3.py`, `fetch_fresh4.py` (dev-clean tarball range into `rawfresh3/ls` first), then `$S/../venv/bin/python $S/build_corpus.py` and `build_fresh.py <1|2|3|4>`. The venv needs numpy, scipy and soundfile.
- Scratch checks: `node $V/redcheck.mjs energy-gate` fails and `node $V/redcheck.mjs rnnoise` passes (hot-mic recordings sent as clips: 100% before, 1.1% after); `node $V/scheduler.mjs` (33 checks); `node $V/keepclips.mjs` (19 checks).
- Local Blossom round trip: `node $B/roundtrip.mjs` starts `$B/blossom-server.mjs` (BUD-02 PUT /upload with a verified kind 24242 auth, GET and HEAD by sha256, CORS and preflight, 20 MB cap, signed DELETE) and an EphemeralRelay on local ports, runs `sendAudioClip` through `Media({servers:[url]})`, reads the event back with a second client, and checks bytes, sha256 and the expired cases (19 checks). The server starts alone with `node $B/blossom-server.mjs`.

## Voice thread catch-up (nothing we miss while talking is lost)

Code: wireweave `src/voice-thread-audio.js` (`CATCHUP`, `PcmRing`, `PcmBudget`, `createLaneTaps`) and `ThreadScheduler` in `src/modules/voice-thread.js`; zellous `docs/js/modules/voice-thread/index.js` (lane state, lag, 400 ms refresh tick); design `src/modules/voice-thread/thread-view.js`. `createVoiceThread` requires `vadLoader`.
- Every remote stream is tapped by an AudioWorklet (`createStreamTap`, module cached per AudioContext) into one `PcmRing` per speaker: 24 kHz Int16, 10 ms frames, each frame labelled voiced when the RNNoise 3-frame mean is at least 0.4. A ring stores only while the gate is closed (own talk, or any queue playing); with the gate open it follows live and keeps nothing. No MediaRecorder on the receive side.
- Cap: 5 minutes per speaker, 96 MiB across speakers (`PcmBudget`). Over the cap the oldest non-voiced frame goes first, then the oldest voiced frame; the lane shows "Dropped N of the oldest audio".
- Playback: `ring.take(20 s)` makes a plan: every voiced frame, 300 ms before and 200 ms after it (the RNNoise label trails a word onset by about 200 ms), and any other non-voiced run shorter than 200 ms; longer non-voiced runs are skipped. A frame also counts as voiced when it is above -45 dBFS or within 25 dB of that speaker's recent speech peak (`SpeechGuard`), so loud audio the VAD misses is never skipped. The plan plays through an `Audio` element with `preservesPitch` at 1.5x (1x when the lag is under 300 ms). Stretches queue behind the same speaker's clips and play one speaker at a time in arrival order.
- Interruption: our talk closes the gate and stops what is playing; the unheard part goes back to the head of its lane (clips with `offsetMs`, stretches through `ring.restore`), so a re-interruption loses nothing. Playback resumes 300 ms after our talk ends (`ownTalkGraceMs`) so a VAD flicker does not stutter.
- A lane returns to live only when it holds no voiced frame, so the trailing non-voiced audio (quiet and labelled non-voiced) is dropped at hand-off. Lane states are `live`, `behind` and `catching-up`, with `lagMs` and dropped totals in the snapshot.
- Observed, not investigated: with three real peers both remote streams carried the same speaker's voice (wireweave has a hub election in `voice.js`), so per-speaker behaviour is witnessed from `MediaStream`s in one page, not through three peers.
- Witnesses: `node $V/scheduler.mjs` (100 checks: remainder, rate, gap skipping, cap order, two speakers, re-interruption, grace). `scripts/ship/thread-catchup.mjs` is opt-in tooling, not part of `ship.sh`: `SPEECH_DIR=<dir of 48 kHz mono 16-bit wav clips> CHROME_EXE=... node scripts/ship/thread-catchup.mjs [interrupt] [clip] [two] [cap]` starts the dev server and an EphemeralRelay, runs real Chromium processes with `--use-file-for-fake-audio-capture`, hooks every media element of the receiver to record what it plays, and aligns the recording to the source with a DTW (`thread-catchup-align.mjs`) that may skip only silent source frames; `cap` runs about 11 minutes. `interrupt` is two peers over WebRTC with Chrome audio processing off (echo cancellation ducked the sender while the receiver talked); `clip`, `two` and `cap` drive the real scheduler, tap, RNNoise and `Audio` playback in one page from `MediaStream`s, because over WebRTC the sender queues its own speech as data-channel clips while we talk.

@.gm/next-step.md
