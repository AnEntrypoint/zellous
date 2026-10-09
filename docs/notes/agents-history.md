# AGENTS.md history

Dated incident narratives, fixed-bug notes and the learning-audit log, moved out of `AGENTS.md` on 2026-10-09. Each entry below is the original paragraph, copied verbatim. The standing rules those paragraphs carried are restated in `AGENTS.md`, so nothing that is still true was dropped.

Editorial notes (outside the quoted entries) on identifiers these entries name that no longer match the tree on 2026-10-09:
- `dmView()` in `nostr-adapter.js` (2026-10-06 entry): not present in the tree. The DM home lives in `docs/js/adapter/dm.js` (`dmConversations`).
- `pageChannels()` in `nostr-adapter.js` (2026-10-07 entry context): now in `docs/js/adapter/rail.js`.
- `scripts/audit-ui.mjs` (2026-10-07 entry): not present in the tree on 2026-10-09.
- `wireweave-bridge.js` as the home of `setAudioConstraints`/`setForceRelay`/`media-warning`: now `docs/js/bridge/voice.js`.

## Validation-loop snippet 2 (port 5173)

**The validation-loop snippet 2 at port 5173 is the exception.** The `.mjs` files it serves need `text/javascript`, which the snippet sets explicitly. If you copy an older snippet that omits the MIME map, `.mjs` module loads fail; use port 5175 or add the MIME map.

## Learning audit (audit log summary)

Audit history from 2026-04-30 through 2026-08-11 (cold-start sampling, several adversarial audit sessions, and the CDN-independence migration) is summarized in rs-learn; the durable outcomes are the rules above and the code itself. Process notes that still apply:

## 2026-10-06: restored the documented CDN consumption

2026-10-06: restored the documented CDN consumption (a repo re-init had left stale vendored `docs/vendor/{design,wireweave}` copies, a dead `.gitmodules` and a root `test.js`; all removed). `zellous.css` was rewritten from 839 layered `!important` lines to a lean file that defers chat, composer and message layout to the SDK; the legacy `#drawerOverlay` is gone. Added a display-name modal (`auth.setDisplayName`, kind:0) and a direct-message home (`dmView()` in `nostr-adapter.js` feeds the SDK's `dmConversations`/`activeDmPeer`/`newDm`/`selectDm` contract). jsdelivr `/gh/@main` purge is rate-limited per path: verify a fresh SDK push against a `@<sha>` URL instead of polling `@main`.

## 2026-10-06 verification note

2026-10-06 (verification note): live witnessing of a fresh `@main` push needs a browser session with an empty HTTP cache (`agent-browser --session <new>`); a reused profile keeps serving the previous `247420.js` for hours and makes a landed fix look undeployed. The legacy hidden auth modal in `index.html` still contains a `.modal-btn.danger` "Logout" button, so selectors for the new `ui.confirm` dialog must be scoped to `[role=alertdialog]`.

## 2026-10-06 engine coverage

2026-10-06 (engine coverage): Safari's engine is testable without root -- Playwright's `ubuntu24.04-x64` WebKit fallback build (`PLAYWRIGHT_HOST_PLATFORM_OVERRIDE`) plus noble `.deb`s extracted with `dpkg -x` into `minibrowser-wpe/sys/lib` (its wrapper script overwrites `LD_LIBRARY_PATH`, so only `sys/lib` works), driven with `playwright-core` and the `iPhone 15` profile (real touch, coarse pointer). It found two bugs Chromium and Firefox hid: SVG icons inside flex buttons collapsed to 4px wide (`svg.ds-icon { flex-shrink: 0 }` in the design repo) and off-canvas drawers letting the page pan sideways (`.ca-app { position: relative; overflow: hidden }` at mobile widths). Firefox 157 plus geckodriver (tarball from download.mozilla.org, extracted with python `lzma`) also runs headless for real-keyboard checks.

## 2026-10-06 hardware-only checks

2026-10-06 (hardware-only checks, never witnessed by an agent): safe-area handling was verified only by substituting `env(safe-area-inset-*)` with 47px/34px in the served CSS under WebKit (header content clears the top inset, composer clears the bottom inset); the on-screen keyboard only by shrinking the viewport. Still needs a human on real iOS Safari and Android Chrome: focus the composer and confirm the page does not zoom and the composer stays above the keyboard; rotate to landscape on a notched iPhone; fling-scroll a long channel; long-press and swipe on message actions; open the drawer with a left-edge swipe (implemented in `ui-shell.js`, verified only with synthetic CDP touches in Chromium, never a real finger).

## 2026-10-07 GUI audit pass, three repos

2026-10-07 (GUI audit pass, three repos): `zellous` and `design` are on `main`; `design` is consumed at `@main`, and `wireweave` is pinned (see above). A user-perspective audit over the live page fixed what it found. Channel reorder now lives in the rail's own `railPill` (drag and Alt+Arrow), via `A.reorderChannel`, which republishes the destination category's full sibling list so a cross-category drop lands in the target category. The mobile hamburger toggles the drawer instead of only opening it. Off-canvas surfaces (the rail and the member list) take `inert` while closed, not `aria-hidden`: webjsx assigns `el[key] = null` as an expando for keys not `in el`, so a nulled `aria-hidden` attribute stays in the DOM. The 900px breakpoint is tracked in JS via `matchMedia`, because crossing it changes no signal and so triggers no re-render on its own. The mobile header carries the current server name ahead of the channel name, since below 900px the rail is off-canvas. Unread badges: `wireweave/src/unread.js` opens one subscription per server covering every text channel's `#e` tag, counts events newer than a per-channel persisted last-read, and marks the active channel read as messages land. `scripts/audit-ui.mjs` skips controls scrolled outside their scrollport and hover-only (`opacity: 0`) chrome, files occlusion by an open drawer under `behindOpen`, credits a focus ring drawn on an ancestor, and reports the tappable row next to an undersized control.

## 2026-10-09 AGENTS.md compaction: originals moved out

AGENTS.md went from 32161 bytes to under 27000 by condensing the paragraphs below. Each block is the original text copied verbatim from the 32161-byte AGENTS.md, by original line number. Operational rules from these blocks are restated in AGENTS.md; the rest lives only here.

### Original AGENTS.md lines 3-3: Intro line

```text
This file is for agents (Claude Code, etc.) working in this repo. For the architecture reference, read `CLAUDE.md` first; this file only adds operational discipline.
```

### Original AGENTS.md lines 5-44: Repo shape, edit table and wireweave pin section

```text
## Repo shape (one-liner)

Static GH-Pages app under `docs/`. Real protocol logic is **`wireweave`**, loaded from the `AnEntrypoint/wireweave` GitHub repo through jsdelivr's `/gh/` CDN and the injected importmap, **pinned to commit `fbcee886afc492f95eba5d6d6efd7dab914b3125`** (see the next section). There is no vendored copy, no submodule, and no npm/unpkg dependency. Window globals are wired in `docs/js/bridge/*.js`, run in order by `docs/js/wireweave-bridge.js`. No backend, no build for the app itself; `flatspace.config.mjs` + `site/` only build the marketing landing into `dist/`.

## What you almost certainly want to edit

| Goal | Edit here |
|---|---|
| Change UI render / layout for the whole app | edit `anentrypoint-design`'s `mountCommunityApp` (see GUI ownership section) — only `docs/js/sdk-command-palette.js` survives as a subtree mount |
| Change zellous-side actions/state feeding the SDK | `docs/js/adapter/*.js` and `docs/js/nostr-adapter.js` (adapter contract), `docs/js/ui-actions.js`, `docs/js/state.js`, `docs/css/zellous.css` |
| Change protocol behavior (Nostr events, voice signaling, etc.) | the `AnEntrypoint/wireweave` repo, push to `main`, then bump the pinned commit SHA in zellous (two places, see "wireweave is pinned"). zellous does not pick up a wireweave push by itself. |
| Expose / rename a window global | `docs/js/bridge/*.js` (each `install*` publishes its globals; `docs/js/wireweave-bridge.js` runs them in order and mirrors them under `window.__zellous`) |
| Add a vendored dep (not wireweave) | `scripts/fetch-vendor.js`, then add an importmap entry inside the inline injector script in `docs/nostr-chat/index.html` |
| Touch state | `docs/js/state.js` (single source of truth for signals) |
| Improve an SDK component (or add a missing one) | edit the `AnEntrypoint/design` repo's `src/components/*.js` + the relevant cssPart (`community.css`/`editor-primitives.css`/`app-shell.css`/`community-app.css`), re-export from `src/components.js` (barrel re-export is what makes it `C.X`), run `node scripts/build.mjs`, then **commit the rebuilt `dist/247420.{js,css}` and push the SDK repo to `main`**. zellous loads `https://cdn.jsdelivr.net/gh/AnEntrypoint/design@main/dist/247420.{js,css}` live, so there is no re-vendor step and no zellous commit (see the SDK section). |
| Marketing landing | `docs/index.html` (live) and/or `site/` + `flatspace.config.mjs` (CI-built `dist/`) |

## wireweave is pinned to a commit on jsdelivr's `/gh/` CDN

zellous has **no wireweave submodule, no vendored wireweave copy, and no npm dependency on it**. The inline importmap injector in `docs/nostr-chat/index.html` maps the bare specifier `wireweave` to

`https://cdn.jsdelivr.net/gh/AnEntrypoint/wireweave@fbcee886afc492f95eba5d6d6efd7dab914b3125/src/index.js`

and `docs/js/bridge/boot-status.js` does `await import('wireweave')` (its `loadProtocol()`, called from `docs/js/wireweave-bridge.js`), and the bridge calls `mod.createWireweave({...})`. `package.json` carries no `wireweave` entry; the browser is the only consumer.

**The entry is pinned to a commit SHA, not `@main`.** Reason: a mixed-version jsdelivr tree (wireweave `src/` files resolved from different commits) broke boot, and the pin makes the loaded tree one fixed commit (verified live). fbcee88 is the pinned tip, set by zellous commit `431106d` ("fix(boot): pin wireweave to fbcee88, the NIP-17 extension DM fix"). A wireweave push therefore does **not** change zellous's behavior until zellous bumps the pin.

Both pin sites must move together:
- `docs/nostr-chat/index.html`: the `wireweave:` entry of the injector's `imports` map.
- `scripts/dev-server.mjs`: `CDN_WIREWEAVE`, which rewrites that URL to the sibling checkout under `npm run dev:local`.

**Bump procedure:**
1. Commit and push `AnEntrypoint/wireweave` to `main`; take the full 40-character SHA.
2. Replace the SHA in both sites above. Confirm with a codesearch for `wireweave@` in this repo that only those two lines carry a SHA.
3. Re-verify boot against the production CDN path (not `--local`) in a fresh browser session with an empty HTTP cache: `window.appReady===true`, zero console errors (Google Fonts failures excepted), and `window.__boot` not in the failed state.
4. Commit the bump in zellous.

**Tradeoffs:** boot depends on `cdn.jsdelivr.net` being reachable. If the protocol layer fails to load, `docs/js/bridge/boot-status.js` reports `window.__boot?.fail(...)` and the bridge rethrows; wireweave is the whole protocol layer, so there is no degraded mode. To test an unpinned or local wireweave, run `npm run dev:local`, which repoints the importmap at `/config/workspace/wireweave`.

wireweave takes its dependencies by injection (`createWireweave({ nostrTools, xstate, storage, ... })`, and `NostrAuth` throws `nostrTools required` rather than importing it), and every module under its `src/` imports only relative siblings. The CDN-served entry therefore emits no bare specifier for the importmap to resolve; `nostr-tools` and `xstate` keep their local `../vendor/` entries.
```

### Original AGENTS.md lines 46-61: GUI ownership, final cleanup and vendor warning

```text
## GUI ownership: the SDK owns the whole app (`mountCommunityApp`)

The entire chat/community GUI lives in `anentrypoint-design`. `src/community-app.js` exports `mountCommunityApp(root, adapter)`, which composes every surface (topbar, server+channel rail, chat body, member list, voice view with grid/controls/ptt/vad/webcam, user panel, and all overlays: context-menu, emoji-picker, command-palette, auth-modal, boot-overlay, settings-popover, voice-settings-modal, video-lightbox, audio-queue, thread-panel; channel-type bodies forum/page) and wires them to an injected `adapter`. It is barrel-exported (`window.__sdk.C.mountCommunityApp`) and styled by the `community-app.css` cssPart (`.ca-app`/`.ca-rail`/`.group`/`.rail-empty`/`.vx-view` + `--cat-*` tokens). A reference kit lives at `ui_kits/community-app/` (mock adapter, no backend). The adapter fields are documented in the `mountCommunityApp` entry of the design repo's `AGENTS.md`.

**zellous is a thin consumer.** `docs/js/nostr-adapter.js` builds the adapter contract `{get()->snapshot, subscribe(cb), actions, helpers}` from one builder per surface in `docs/js/adapter/` (`signals`, `call`, `theme`, `frame`, `rail`, `chat`, `dm`, `members`, `voice`, `settings`, `overlays`, `session`). The builders read `window.stateSignals` (preact signals) and the feature-module actions, and the entry calls `mountCommunityApp(#app, adapter)`. `subscribe` registers a `window.__effect` (set in `docs/nostr-chat/index.html`) over the reactive signals so any change re-renders. The imperative overlay globals (`__contextMenu`/`__emojiPicker`/`__commandPalette`) are re-exposed from the returned `app.api` in `nostr-adapter.js`. The legacy `.app` scaffold is gone from `index.html`, so no dead `display:none` markup remains. The old `docs/js/sdk-*.js` mount IIFEs are deleted; only `docs/js/sdk-command-palette.js` remains, still listed in `index.html`'s `scripts[]`. To change the GUI, edit `anentrypoint-design` (additively) and let gh-pages redeploy.

**Adapter contract** is documented in the design repo (see above). To add a surface: compose it in `mountCommunityApp` reading from the adapter, add any new adapter field, and map it in the matching `docs/js/adapter/*.js` builder. The DM home is `docs/js/adapter/dm.js` (`dmConversations`), and display-name editing goes through `setDisplayName` in `docs/js/bridge/auth.js`.

### Final cleanup deferred (high blast radius)

- Deleting `docs/css/zellous.css` entirely — must wait until every surface above is migrated.
- Switching from subtree mounts to top-level `mount(#app)` — same prerequisite.

Until then, `zellous.css` co-exists with the SDK's `community.css` (the SDK's `cm-*` classes don't collide with zellous's class names).

If you find yourself editing anything under `docs/vendor/`, stop — that's a third-party drop, not first-party code. Protocol behavior changes belong in the `wireweave` sibling repo (`../wireweave`), consumed live over CDN at the pinned SHA, not vendored.
```

### Original AGENTS.md lines 63-74: Verification

```text
## Verification (live runs only)

No hard-coded validations and no test files. Verify behaviour by running the real system and reading the observed output. Do not add scripts or CI jobs that encode pass/fail checks.

- Live browser checks use the gm `crawl` verb with `engine=cdp`. The body is plain text: first line `engine=cdp`, then `url=<absolute URL>`, `wait=<ms>` (about 6000 for the app to boot), and `eval=<js>` (the value is returned). Example: `engine=cdp\nurl=https://anentrypoint.github.io/zellous/nostr-chat/\nwait=6000\neval=JSON.stringify({appReady: window.appReady})`.
- Parse-check a file by hand with `node --check <file>`.
- Report what you observed, with the command and its output. Do not summarise a result you did not see.
- A fresh `@main` push needs a browser session with an empty HTTP cache (`agent-browser --session <new>`); a reused profile keeps serving the previous `247420.js` for hours and makes a landed fix look undeployed.
- The legacy hidden auth modal in `docs/nostr-chat/index.html` still contains a `.modal-btn.danger` "Logout" button (`#nostrLogoutBtn`), so selectors for the `ui.confirm` dialog must be scoped to `[role=alertdialog]`.
- Real-device behaviour has not been witnessed by an agent: iOS Safari safe-area and zoom, the on-screen keyboard, landscape on a notched iPhone, fling-scroll, long-press and swipe on message actions, and the left-edge drawer swipe need a human on real hardware. Say so in any report about mobile behaviour.

There is no CI workflow. Deploy runs on every push to `main` (`.github/workflows/gh-pages.yml`).
```

### Original AGENTS.md lines 76-83: Things that look broken but aren't

```text
## Things that look broken but aren't

- **No `<script type="importmap">` in raw HTML.** It is *injected at runtime* by an early classic script in `docs/nostr-chat/index.html`. Static greps will miss it; the importmap is real.
- **`docs/js/state.js` imports `@preact/signals`.** This works because (a) `state.js` is loaded via `await import('../js/state.js')` from inside the bootstrap module script, and (b) by that time the importmap has been injected.
- **`site/theme.mjs` embeds a browser importmap for `anentrypoint-design`** that loads from jsdelivr `@main`; there is no Node-side import. Don't try to vendor it locally.
- **`dist/index.html` differs from `docs/index.html`.** Different surfaces. `docs/` is the live GH-Pages site; `dist/` is the flatspace build artifact.
- **Repo-insight banners may flag `server.js`, SQL, hardcoded creds, etc.** The summary indexer caches old project shape. The current repo has no server, no SQL, no embedded credentials. Verify against the actual tree before "fixing".
- **No `wireweave` under `docs/vendor/`.** It is resolved live from the `AnEntrypoint/wireweave` repo at the pinned SHA via jsdelivr's `/gh/` CDN, not a vendored directory. A plain `git clone` is complete and boots with no submodule step.
```

### Original AGENTS.md lines 95-111: Non-obvious technical caveats (the line-113 adapter-boolean rule and lines 115-117 are kept in AGENTS.md verbatim and are not repeated here)

```text
## Non-obvious technical caveats

**Generic file uploads go through Blossom for every file type.** `chat.sendImage()` (`wireweave-bridge.js`) routes any file through `window.nostrMedia.sendMedia()`, backed by wireweave's `Media` class (`../wireweave/src/media.js`): a direct browser `fetch`/`PUT` to a public Blossom server (NIP-98-style signed kind:24242 auth, no backend of ours), which returns a URL embedded as the content of a normal kind:42 channel message. Blossom has no type restriction, only a 20MB cap enforced in `media.js` and surfaced as a toast. `ui-actions.js`'s `handleFileSelect` and `files.js`'s paste/drag-drop handlers all use this path. `files.js` no longer has a chunked/base64 upload; its old implementation depended on `state.ws`, which is always null in Nostr mode.

**gm's `browser` verb: if it CDP-times-out silently, check the launch log first.** The browser-launch code is `AnEntrypoint/agentplug`'s `crates/agentplug-host/src/browser.rs` (external repo, not in this checkout), compiled into `~/.gm-tools/agentplug-runner` (an older `~/.gm-tools/plugkit-wasm-wrapper.js` was a deprecated file that is not on the real path; it is absent on this host). The sandbox failure mode (Chrome exiting with `No usable sandbox!` in containers) is fixed upstream: `launch_chrome()` captures Chrome's output to `browser-chrome-profile-<session>/chrome-launch.log` and retries once with `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage` on a sandbox denial (agentplug commit `124fadf`). If the verb times out again, read that log first; to reproduce from source, clone `AnEntrypoint/gm` (its `agentplug` submodule is the real source), `cargo build --release -p agentplug-runner`, then dispatch `browser` directly.

**gm's `browser` verb supports a `viewport=WxH\n` prefix for mobile/device-viewport testing.** Stack it in the same body-prefix chain as `timeout=`/`url=` (order matters: `timeout=`, then `viewport=`, then `url=`, then the script body — a prefix out of order is left unstripped and corrupts the downstream script/URL parse into a `SyntaxError`). `viewport=375x667\n` applies a real CDP `Emulation.setDeviceMetricsOverride` (+ touch emulation) before navigation, so responsive-CSS breakpoints can be exercised directly (e.g. `.app-topbar nav` is `display:none` at 375×667 and `display:flex` at 1280×800). Optional `@scale` suffix sets `deviceScaleFactor` (`375x667@2`); optional trailing `!desktop` disables mobile/touch emulation for a custom-but-non-mobile viewport. The script body must `return` its value from inside the `(async()=>{...})()` wrapper — a bare trailing expression is discarded, not returned.

**Bans, timeouts and personal mutes are enforced in text chat, not only in voice.** `wireweave/src/chat.js`'s `send()` rejects (emitting `send-blocked`) when the sender is banned or timed out in the current server. Both the history-load and live-message subscriptions drop events from banned, timed-out and personally-muted authors before they reach the message list, as defense in depth against a bypassing client. Personal mutes are a NIP-51 kind:10000 list (`wireweave/src/mutes.js`, one `Mutes` per session, `.load()` at boot, deferred via the auth object's `'login'` event if `auth.pubkey` is not populated yet). A personal mute affects only the viewer's own view; an admin ban is server-wide.

**Message deletion (NIP-09 kind:5) is applied to other viewers.** `wireweave/src/chat.js` subscribes to `chat-deletions-<channelId>` (in `loadHistory()`), and honors a deletion only when the deleter is the original author or holds the owner, admin or moderator role. A kind:5 carries only the deleted message's id, so the channel check happens client-side against the locally cached message list; a deletion that arrives before its message is kept in `_pendingDeletes`.

Any reactive voice-state signal derived from wireweave CustomEvents must be seeded on `'connected'`, not only on later change events (`'participants'`) — a self-only join is the one case where those change events never fire. `docs/js/bridge/voice.js` seeds `state.voiceParticipants` in its `'connected'` handler for this reason; `docs/js/adapter/voice.js` derives the SDK's `speaking`/`color` fields from wireweave's raw `isSpeaking`/no-color shape.

**Voice join works without a microphone.** `wireweave/src/voice.js`'s `connect()` catches a `getUserMedia()` failure, leaves `localStream` `null`, and joins with a `recvonly` transceiver. A `media-warning` event (shown as a toast in `docs/js/bridge/voice.js`) tells the user they joined listen-only.

**Voice settings apply on the next join.** Mode, device, RNNoise, AutoGain, ForceTURN and bitrate are stored in `state.js`, and `docs/js/adapter/voice.js`'s `openVoiceSettings`/`voiceSettingsSave` pass them to `docs/js/bridge/voice.js` (`setAudioConstraints`, `setForceRelay`). No live peer-connection renegotiation happens; a change takes effect on rejoin.
```

### Original AGENTS.md lines 119-144: Legacy overlays, context menus, rail, inert, breakpoint, reorder, unread, pages, forum, reactions, untrusted text, focus, disk-full and day separators

```text
**Legacy overlays and inputs with no `position` rule inflate `document.body.scrollHeight`.** The legacy DOM still wired to legacy controllers (`#videoPlayback` toggled by `webcam.js`, `#settingsPopover` toggled by `ui-actions.toggleSettings`, `#fileInput.hidden-input`) must keep an explicit rule: `zellous.css` positions `.video-playback` and `.settings-popover` as `position:fixed; display:none` overlays (z-index 2600) and `.hidden-input` as a visually-hidden 1px clip. Any always-present overlay or trigger element added to `index.html` needs a `position:fixed`/`absolute` plus hidden-by-default rule, or it sits in normal flow and inflates body height. Because `html,body { overflow:hidden }` is set, the inflation shows no scrollbar. Verify with `document.body.scrollHeight <= window.innerHeight` in a browser witness.

**Legacy context menus need `.open`.** `docs/js/nostr-channels-ui.js`'s shared `_mkMenu(id, x, y, html, onAction)` must set `className = 'context-menu open'`; `zellous.css` shows `.context-menu` only with `.open`. Any new legacy DOM overlay should be checked against its CSS's default-hidden state the same way.

**The rail's channel groups.** `mountCommunityApp`'s rail (`railPill` in the design repo's `src/community-app.js`) renders flat "rooms"/"voice"/"servers" groups. Each group header carries a create button that shows only when `adapter.get().canManage` and `adapter.actions.createChannel` are present; zellous wires `createChannel` to `channelManager.showCreateModal`. The unused `ChannelSidebar` export in the SDK is not mounted.

**Off-canvas surfaces take `inert`, not `aria-hidden`.** The rail and the member list take `inert` while closed. webjsx assigns `el[key] = null` as an expando for keys not `in el`, so a nulled `aria-hidden` attribute stays in the DOM.

**The 900px breakpoint is tracked in JS.** `docs/js/ui-shell.js` uses `matchMedia` for it, because crossing the breakpoint changes no signal and so triggers no re-render on its own.
**Channel reorder lives in the rail.** Drag and Alt+Arrow reordering are the rail's `railPill` behaviour, dispatched through the `reorderChannel` adapter action (`docs/js/adapter/rail.js`). It republishes the destination category's full sibling list, so a cross-category drop lands in the target category.

**Unread badges.** `wireweave/src/unread.js` opens one subscription per server covering every text channel's `#e` tag, counts events newer than a per-channel persisted last-read, and marks the active channel read as messages land.

**Pages are created from the server context menu.** Page channels are synthesized from kind 30078 events (`pageChannels()` in `docs/js/adapter/rail.js`), not by the regular channel flow. "Create Page" is in the owner-gated server context menu, and editing uses `showEditPageModal` (title plus HTML textarea).

**Forum posts** (kind:11 thread roots, NIP-22 kind:1111 replies, `wireweave/src/forum.js`) are scoped to a channel by the same hashed-channel-tag discipline as kind:42 messages. `threadManager.select()` routes forum-type channels to `selectForumPost()`, because a forum post id is never a real channel id. Replies are flat by design (each reply tags the root post only).

**Reactions** (NIP-25, kind:7): `wireweave/src/reactions.js` aggregates client-side keyed by the last `e` tag, last-write-wins per pubkey and target. `window.nostrReactions` (defined in `docs/js/bridge/chat.js`; `getFor`/`react`/`unreact`) feeds each message's `reactions` field in `docs/js/adapter/chat.js`.

**Untrusted Nostr text is escaped before `innerHTML`.** Server names and colors (kind:34550 tags) and channel type labels are attacker-controlled. Route every such value through `escHtml()` in `nostr-servers-ui.js` and `nostr-channels-ui.js`. Pages HTML goes through the SDK's DOMPurify-backed `sanitizeHtml()`, and chat message text is inserted as text nodes.

**Focus moved into a newly opened overlay must wait a task.** Use `setTimeout(fn, 0)`, not `queueMicrotask`: a microtask runs inside the triggering click, before the browser's own focus-on-click settles, so focus can stay on the trigger and break Escape-to-close and the Tab trap. This is fixed in the design repo's overlays (SettingsPopover, EmojiPicker, Popover, ContextMenu, Drawer, Dialog, VideoLightbox); keep new overlays on the same pattern.

**Disk-full destabilizes the `browser` verb's chromium.** At 100% disk, a `Write`/`Edit` can truncate a file to 0 bytes (ENOSPC mid-write), and playwriter chromium can crash on long-busy operations. Recovery: (1) `git checkout -- <file>` to restore truncated files; (2) close the browser session, stop only the orphaned `ms-playwright` chrome processes (filter the command line for `*ms-playwright*`; never the user's personal Chrome), and `rm -rf .gm/browser-profile` if it exists (gitignored; the browser verb recreates it); (3) start a fresh session. Under disk pressure, prefer short `waitForTimeout`-based witness bodies over long `waitForFunction` ones.

The chat thread shows day separators (`Today`/`Yesterday`/`October 3`) from `design`'s `threads.js`; they render only for `variant === 'community'` (set only by `community-app.js`) and only on a numeric `ts`. Chat history loads with `limit: 50` and no `since`, and the live subscription starts at `since: now`, so a message published with a back-dated `created_at` is only visible after a reload -- worth knowing when probing anything time-based.
```

### Original AGENTS.md lines 173-173: How docs/ reaches production

```text
**How `docs/` reaches production (`dist/` is not just the marketing landing).** `.github/workflows/gh-pages.yml` runs `npx --yes flatspace@1.0.23 build` and uploads `./dist` as the Pages artifact; Pages serves `dist/` directly, not `docs/`. `site/theme.mjs`'s `assets` map (`'../docs/nostr-chat': 'nostr-chat'`, plus `docs/vendor`, `docs/css`, `docs/js`, `docs/msgpackr.min.js`) copies those paths from `docs/` into `dist/` verbatim at build time; flatspace only renders `dist/index.html` (the landing) from `site/content/`. So `docs/` is the source of truth you edit, and `dist/nostr-chat/` is a straight copy of `docs/nostr-chat/` produced on every deploy.
```

### Original AGENTS.md lines 175-215: Kit consumption, CI gates, tokens, working discipline and history pointers

```text
## Kit consumption (SDK JS + CSS, live from jsdelivr)

There is no local SDK copy anywhere in zellous. `docs/sdk/` does not exist, and no kit CSS is vendored; do not reintroduce a vendored copy. Both pages link the single bundled stylesheet `https://cdn.jsdelivr.net/gh/AnEntrypoint/design@main/dist/247420.css` (`docs/index.html` and `docs/nostr-chat/index.html`). The app's importmap maps `anentrypoint-design` to `https://cdn.jsdelivr.net/gh/AnEntrypoint/design@main/dist/247420.js`.

- The GitHub repo is `AnEntrypoint/design`; its npm package name is `anentrypoint-design`. Don't confuse the two when building URLs.
- The bundle is `colors_and_type` + `app-shell` + `community` + `editor-primitives` (+ the community-app parts), all scoped under `.ds-247420`, which `<html class="ds-247420">` matches.
- Only the bundled `247420.css` is linked. The source cssParts (`community.css`, `editor-primitives.css`, `app-shell.css`, `colors_and_type.css`, `community-app.css`) are inputs to the bundle, not separate dist files, so do not link them individually. A class missing from the bundle renders unstyled with no error; after an SDK change, confirm the class is in `dist/247420.css`.
- **To propagate an SDK change:** run `node scripts/build.mjs` in the design repo, commit the rebuilt `dist/247420.{js,css}` (both are tracked; the design `.gitignore` excludes only `dist/index.html` and `dist/.nojekyll`), and push to `main`. zellous picks it up on the next page load.
- **Tradeoff:** zellous boot depends on `cdn.jsdelivr.net` being reachable. The SDK import in `docs/nostr-chat/index.html` is in try/catch: on failure it sets `window.__sdk = null`, reports `window.__boot?.fail(...)` and rethrows, so the boot screen shows a message instead of a blank page.
- `package.json` declares no `anentrypoint-design` entry. `site/theme.mjs` only embeds the SDK URL in a browser importmap, and nothing in the Node build imports the SDK.
- **Only the `anentrypoint-design` package is loaded this way.** `gmsniff` (vendors a kit subset, makes zero external-origin runtime fetches, because it must run air-gapped) and `agentgui` (vendors the built kit locally for offline operation) are deliberately excluded from CDN loads and must stay excluded. Do not convert either to a CDN load or a runtime dependency.
- Accepted tradeoff of a floating `main`-branch CDN load: a design push can change zellous's UI with no commit in zellous. That is the intended behavior for the SDK; the wireweave dependency is pinned precisely because it is not.
- jsdelivr `/gh/@main` purge is rate-limited per path: verify a fresh SDK push against a `@<sha>` URL instead of polling `@main`.

Two `design` CI gates to know before pushing an SDK change: the RTL lint (`scripts/lint-rtl-physical-properties.mjs`, run from `scripts/lint-css.mjs`) compares the physical-declaration count against the frozen baseline in `scripts/lint-rtl.baseline.json` (currently 321), so new `left`/`right`/`margin-left`/`text-align: left` in CSS fails the build; write the logical property (`inset-inline-*`, `margin-inline-start`, `text-align: end`) instead, and `env(safe-area-inset-left)` names stay physical. And adding or renaming a component prop makes `docs/component-props.md` stale: run `node scripts/generate-component-docs.mjs` (plus `generate-component-types.mjs`, `generate-component-manifest.mjs`, `gen-exports.mjs`) and commit the result in the same change.

**SDK component reaches consumers as `C.X` only via the barrel** — `src/components.js` does `import * as components` and a consumer reads `sdk.C.X`. A new `export function Foo` in a component file is invisible until re-exported from `src/components.js`. A consumer that polls `setTimeout(init,30)` on `!sdk.C.Foo` (see `docs/js/sdk-command-palette.js`) stays dead with no error, so a missing barrel re-export is a silently dead feature, not a crash.

**Static dev server must set MIME types** — When serving `docs/` locally for module script testing, the dev server must send explicit `Content-Type` headers (e.g. `text/javascript` for `.js` files). Browsers enforce strict MIME checking for ES modules and will refuse to execute scripts served without the correct type, even if the file content is correct. `scripts/dev-server.mjs` does this.

_History: the port-5173 validation-snippet MIME note (its snippet is no longer in this file) is in `docs/notes/agents-history.md`._

**Design tokens as CSS variables** — `zellous.css` uses only design tokens (`--bg`, `--fg`, `--accent`, `--green`, etc.) sourced from the bundled `247420.css` (the SDK's colour and type tokens). It is token-only and defers layout to the SDK; the legacy layout stylesheets are gone and must not come back. Don't hardcode colors or add layout overrides for SDK classes. Overrides that match the SDK's own selectors lose on specificity (for example, an ink-theme token block in the SDK beats a plain `:root` rule), so check the computed value in a browser witness, not just the CSS.

## Working discipline

Process notes from past audits that still apply (the dated audit log is in `docs/notes/agents-history.md`):

- Under concurrent pushes to `design`/`zellous`, fetch, diff for disjoint changes, and re-apply rather than force-pushing. Don't trust a `prd-resolve` success response alone under concurrent load; spot-check `.gm/prd.yml`.
- A fix round is evidence of progress, not convergence. Re-verify fixes with a reviewer that reads only the diffs.
- A "surely fine" mechanical deletion (removing a script tag and its module) still needs the live boot witness, not just the parse-check. An earlier deletion of `docs/js/audio.js` left a stray reference that threw on every boot, and only the browser witness caught it.

_History: the 2026-10-06 CDN-consumption restore is in `docs/notes/agents-history.md`; its standing purge rule is under Kit consumption._

_History: the 2026-10-06 verification note is in `docs/notes/agents-history.md`; its standing rules are under Verification._

_History: the 2026-10-06 engine-coverage recipe (WebKit, Firefox) and the bugs it found are in `docs/notes/agents-history.md`._

_History: the 2026-10-06 hardware-only checks are in `docs/notes/agents-history.md`; the standing gap is under Verification._

_History: the 2026-10-07 GUI audit pass is in `docs/notes/agents-history.md`; its standing facts are under Non-obvious technical caveats._
```


### Original AGENTS.md lines 115-117: Windows path traversal and Playwright viewport API (reworded in AGENTS.md)

```text
**Windows static dev server path traversal** — When implementing path traversal checks for a dev server on Windows, use `path.resolve(ROOT)` + `path.resolve(path.join(ROOT, p))` for normalization. Raw `startsWith()` on forward-slash ROOT vs backslash-joined paths fails because backslashes don't normalize correctly for string comparison.

**Playwriter (exec:browser) viewport API** — playwriter uses Playwright's `page.setViewportSize({width, height})`, NOT puppeteer's `page.setViewport()`. The method name and parameter structure differ. Ensure viewport manipulation code targets Playwright, not puppeteer.
```

Editorial notes on the 2026-10-09 block above (identifiers that no longer match the tree on 2026-10-09):
- `_handleDeletion()` (the 2026-07-24 deletion entry, original AGENTS.md line 105): not present in `wireweave/src/chat.js`. The `chat-deletions` subscription it names is present in wireweave (`chat-deletions` has one hit in the sibling repo).
- `createPage` (not named in the archived text): zero hits in the tree; the Create Page flow is labelled "Create Page" in the server context menu.
- `ChannelSidebar` (original line 123): one hit remains in the tree, not mounted by zellous.

## 2026-10-09 comment sweep: candidates not promoted to AGENTS.md

Each candidate is the original comment text, copied verbatim from the sweep ledger. The verdict line after it records the 2026-10-09 codesearch check. TRUE means the fact holds but is not kept in AGENTS.md (obvious, duplicate or historical). STALE means the fact no longer holds in the tree as described. UNVERIFIABLE means codesearch could not confirm it.

- CANDIDATE (chat.js): 'Delegates to the library Chat instance's own field rather than tracking a separate copy -- loadHistory() can be triggered either through this bridge's wrapper below or directly by wireweave.js's onSwitch callback (e.g. the first-run auto-join path), and both must be reflected here.' | docs/js/bridge/chat.js:60-63 (original). Removed from code.
  Verdict: STALE - docs/js/bridge/chat.js:66 is now `await ww.setCurrentChannel(channelId)`; the delegation to a library Chat field no longer exists.

- CANDIDATE (dm.js): 'DM bridge — NIP-44 encrypted 1:1 (kind 14), structurally isolated from the plaintext broadcast Chat (kind 42 filtered by channel-hash '#e' tag). DM.subscribe filters by '#p'/authors on the user's own pubkey, so a DM event can never satisfy a channel chat subscription's kind/tag filter, and vice versa — no shared array, no shared subscription id.' | docs/js/bridge/dm.js:3-7 (original). Removed.
  Verdict: STALE - wireweave src/dm.js:95 subscribes `kinds: [GIFT_WRAP_KIND]` (1059) with `#p`; kind 14 is RUMOR_KIND inside a kind 13 seal (dm.js:1-3). The #p isolation holds; the kind wording does not.

- CANDIDATE (governance.js): 'Personal mute list bridge (NIP-51 kind:10000) -- a per-viewer curation independent of server admin bans; re-renders the chat view when it changes since chat.js filters muted authors out of the local message list.' | docs/js/bridge/governance.js:26-28 (original). Removed.
  Verdict: TRUE - Not kept: personal-mute enforcement is already covered by the existing "Enforcement points" caveat. The re-render path rests on the ui.render.all() question noted in the reactions bullet.

- CANDIDATE (servers.js): "join() emits 'updated' but the first-paint signal read can race it; sync state explicitly so the new server pill shows on the first load." | docs/js/bridge/servers.js:53-54 (original). Removed; the 'state.servers = srv.servers;' line remains.
  Verdict: TRUE - Not kept: docs/js/bridge/servers.js:35 `state.servers = srv.servers;` is present. A fix note with no standing invariant.

- CANDIDATE (bridge/voice.js): 'window.message.add feeds state.messages, which ui.render.messages() (ui.js) is an intentional no-op for -- the SDK owns rendering reactively and never reads state.messages, so anything routed only through window.message.add here is computed correctly but never reaches the screen. window.ui.showToast is the real, live-rendered surface (routes to the SDK's own toast).' | docs/js/bridge/voice.js:84-88 (original). Removed.
  Verdict: STALE - window.message has zero hits in docs/js/bridge/voice.js; the routing this comment describes no longer exists.

- CANDIDATE (threads.js): "The SDK's own ThreadPanel overlay (mountCommunityApp) renders off state.threadPanelOpen -- there is no DOM host of ours to toggle." | docs/js/threads.js:16-17 (original). Removed.
  Verdict: TRUE - Not kept: threads.js reads state.threadPanelOpen (threads.js:11-50); mount detail is visible in the code.

- CANDIDATE (state.js): "PTT gate state (voice-ptt.js) -- feeds the SDK's own .vx-ptt button via nostr-adapter.js's isSpeaking/pttUiMode; voice-ptt.js never touches DOM." | docs/js/state.js:109-110 (original). Removed.
  Verdict: TRUE - Not kept: state.js:107 declares pttState and voice-ptt.js:43-44 publishes window.state.pttState; the DOM-free note is implied by the file layout.

- CANDIDATE (palette.js): '247420 design palette — single source for role + avatar tints across UI modules. Loaded as a classic script; exposes globals for downstream UI files.' | docs/js/palette.js:1-2 (original). Removed. Note the file still sets window.ROLE_COLOR and window.AVATAR_COLORS, which AGENTS' no-new-window.X rule covers.
  Verdict: TRUE - Not kept: palette.js:12-22 sets window.ROLE_COLOR and window.AVATAR_COLORS, an existing exception to the no-new-window.X rule.

- CANDIDATE (sdk-command-palette.js, SDK contract): 'Wires Ctrl/Cmd+K to the SDK's C.CommandPalette (window.__commandPalette, set by nostr-adapter.js once mountCommunityApp resolves). The SDK component is a pure imperative surface: show(items, onSelect) / close(); it renders whatever items it is given each time it is opened — nothing auto-populates it, so this module builds the real command list from live state on every open and re-opens with a fresh list on each keystroke (like ui-shell's removed hand-rolled version did, but driving the real SDK overlay).' | docs/js/sdk-command-palette.js:1-7 (original). Removed.
  Verdict: UNVERIFIABLE - The zellous call site matches (sdk-command-palette.js:57 calls window.__commandPalette.show(commands(), ...)). The SDK side (show/close, no auto-populate) has zero hits for `show(items` under /config/workspace/design/src, so it could not be confirmed.

- CANDIDATE (ui-voice.js, history): 'uiVoice's DOM-rendering methods (renderGrid/renderQueue/renderPanel) and uiMembers.render() were deleted 2026-07-31 -- they only ever targeted the legacy hidden .app scaffold (removed the same day) and had zero live callers once ui.render.* became no-ops. The SDK's own .vx-grid/.vx-queue/ MemberList components (mountCommunityApp) render the real UI, fed by nostr-adapter.js's voiceParticipants/memberCategories()/audioQueue* fields.' Historical; included only for completeness. | docs/js/ui-voice.js:34-39 (original). Removed.
  Verdict: TRUE - Not kept: renderGrid/renderQueue/renderPanel have zero hits in the tree; historical only.

- CANDIDATE (ui.js, SDK ownership): 'Real UI rendering is owned by the SDK's mountCommunityApp (see AGENTS.md GUI ownership) -- it re-renders reactively off nostr-adapter.js's tracked signals. messages/queue/authStatus remain as no-ops only because live call sites in bridge/chat.js, queue.js and ui-actions.js still invoke them.' | docs/js/ui.js:27-30 (original). Removed. The no-op methods still exist.
  Verdict: TRUE - Not kept: ui.js:29 `messages() {}` is a no-op; the ownership rule duplicates the GUI ownership section of AGENTS.md.

- CANDIDATE (ui-actions.js upload): 'Single upload entry point for the file input, clipboard paste and drag-drop. media.js only enforces the 20MB cap after the whole file has been read and PUT, so the real numbers are surfaced here, before any of that starts.' | docs/js/ui-actions.js:69-72 (original). Removed; the 20 * 1024 * 1024 constant remains in sendFiles.
  Verdict: TRUE - Not kept: MAX_UPLOAD_BYTES = 20 * 1024 * 1024 is defined at docs/js/ui-actions.js:70 and wireweave src/media.js:1. Duplicate constant that must stay equal; a candidate for AGENTS.md if room allows.

- CANDIDATE (ui-actions.js Escape handling): 'The real settings popover is the SDK's own reactive SettingsPopover (driven by stateSignals.settingsOpen), not the legacy hidden #settingsPopover element -- that element's class never gets toggled through the live code path anymore, so checking it here always read false and Escape silently never closed the real popover.' | docs/js/ui-actions.js:130-134 (original). Removed.
  Verdict: TRUE - Not kept: ui-actions.js:126 reads sig('settingsOpen'); the legacy overlay case is covered by the existing "Legacy overlays" caveat.

- CANDIDATE (nostr-adapter.js, seam contract): 'nostr-adapter — the thin consumer seam. Maps zellous's Nostr-backed state (window.stateSignals preact signals) + action modules to the design-system adapter contract, then hands the whole GUI to the SDK's mountCommunityApp. All composition/rendering lives in the SDK (window.__sdk.C.mountCommunityApp); zellous only supplies data + action callbacks. Each surface's fields and actions come from its builder in ./adapter/ (one module per surface).' Also removed: 'Snapshot read across the live signals. effect() (inside subscribe) tracks whichever .value reads happen during render, so any change re-renders.' and 'Preserve the imperative overlay globals o | docs/js/nostr-adapter.js:1-6, 49-50, 60 (original). Removed.
  Verdict: TRUE - Not kept: duplicates the GUI ownership section (nostr-adapter.js:4 `const effect = window.__effect;`, :55 `window.__commandPalette`).

- CANDIDATE (adapter/rail.js): 'Without a position these sort ahead of every real channel, which pins the page list above general/announcements in the rail.' (explains PAGE_CHANNEL_POSITION_BASE, now a named constant) | docs/js/adapter/rail.js:3-4 (original). Removed; constant kept.
  Verdict: TRUE - Not kept: rail.js:1 defines PAGE_CHANNEL_POSITION_BASE = 1000 and :9 uses it as `position`; the sort rationale is historical.

- CANDIDATE (adapter/rail.js unread): 'The rail's badge needs a per-channel count, and wireweave's unread tracker keys by channel id only, so a server's badge is the sum over the channels this client knows belong to it.' | docs/js/adapter/rail.js:17-19 (original). Removed.
  Verdict: TRUE - Not kept: rail.js:17-21 sums unreadCounts per server; frame.js:32 reads window.nostrUnread.countsFor. Candidate for AGENTS.md if room allows.

- CANDIDATE (adapter/rail.js hamburger): 'The hamburger is the drawer's own toggle: tapping it while the drawer is open has to close it, or the only way out is tapping the main area or picking a channel.' | docs/js/adapter/rail.js:38-40 (original). Removed; openMobileMenu's if/else remains.
  Verdict: TRUE - Not kept: rail.js:34-36 openMobileMenu toggles; obvious from the code.

- CANDIDATE (adapter/rail.js openServers): 'The SDK's real "servers" nav link (community-app.js) already calls this directly with e.preventDefault() -- there is no separate "servers browser" surface to open, so this toggles the same home/server view goHome()/switchServer() already drive. The legacy #zServersBtn anchor this used to click had no listener of its own (a real dead link, `href="#"` with zero JS behind it) -- removed rather than routed through, since there was nothing there to reach.' | docs/js/adapter/rail.js:66-72 (original). Removed.
  Verdict: TRUE - Not kept: rail.js:50 openServers is present; zServersBtn has zero hits, so the dead legacy link is gone.

- CANDIDATE (adapter/voice.js, Voice Settings): 'Voice Settings changes apply eagerly (the modal reads straight off the live signals), so Cancel can only be honest if the pre-open state is captured here and re-applied -- including the localStorage writes and the live session calls applyVoicePatch makes.' | docs/js/adapter/voice.js:3-6 (original). Removed.
  Verdict: STALE - docs/js/adapter/voice.js has zero "cancel" hits; no pre-open capture or restore logic exists in that file.

- CANDIDATE (adapter/voice.js, SDK button): 'Drives the SDK's own .vx-ptt button (mountCommunityApp's voice view) — voice-ptt.js does the real requestTransmit/releaseTransmit gating and publishes its live state as window.state.pttState, not DOM.' | docs/js/adapter/voice.js:68-70 (original). Removed.
  Verdict: TRUE - Not kept: adapter/voice.js:58 derives isSpeaking from pttState; obvious from the code.

- CANDIDATE (adapter/settings.js key backup): 'There is no account/password-reset path here by design (the private key IS the identity) -- clearing site data or losing the device is otherwise permanent, unrecoverable identity loss with no conceptual recovery. This is the one mitigation a static client can offer: let the user copy their own key out. Absent entirely (returns null) under NIP-07 extension auth, where the extension -- not this app -- holds key custody.' | docs/js/adapter/settings.js:23-29 (original). Removed.
  Verdict: UNVERIFIABLE - No "backup" in docs/js/adapter/settings.js and no "nip07" under docs/js; the NIP-07 null-return claim could not be confirmed (wireweave src/auth.js does take an `extension` option).

- CANDIDATE (adapter/settings.js logout): "The SDK's Settings popover previously had no way to log out at all (only 'switch identity', which reopens the sign-in tabs, never a logged-in/logout view) -- ui.actions.logout() has always existed and worked correctly, it was simply never exposed as an adapter action, so the real, reachable 'Settings' surface had no logout affordance anywhere." | docs/js/adapter/settings.js:33-38 (original). Removed.
  Verdict: TRUE - Not kept: settings.js:26 exposes Logout calling ui.actions.logout; fix note.

- CANDIDATE (adapter/chat.js forum author): 'A forum post's `author` is the raw 64-char hex pubkey off the kind:11 event; resolve it the same way pageAuthor already does so the list shows a name (or a short npub), never a hex string.' | docs/js/adapter/chat.js:10-12 (original). Removed.
  Verdict: TRUE - Not kept: adapter/chat.js:9 uses pageAuthor; forum author resolution fix note.

- CANDIDATE (adapter/frame.js): 'Values several builders read from the same moment in time. Computed once per get() so every builder sees one consistent view of home/DM/channel/server state.' | docs/js/adapter/frame.js:21-22 (original). Removed.
  Verdict: TRUE - Not kept: frame.js:21-33 builds one frame per get(); obvious from the code.

- CANDIDATE (adapter/session.js identity fallback): 'UserPanel (header) previously fell back to a literal "You" whenever this was null -- while the message-row avatar for the SAME identity derives its initial from resolveProfile(userId), the real npub-based name. Two different fallbacks for one identity produced two different avatar initials ("Y" vs "n") for the same user. Resolving through the same helper keeps both surfaces showing one name.' | docs/js/adapter/session.js:11-16 (original). Removed; currentUser() kept.
  Verdict: STALE - No "You" literal in docs/js/adapter/session.js; the fallback now resolves through window.chat.resolveProfile (session.js:5).

- CANDIDATE (adapter/signals.js): 'preact effect: reading each .value registers a dependency, so cb re-fires on any change' | docs/js/adapter/signals.js:13 (original). Removed.
  Verdict: TRUE - Not kept: the effect-based subscribe is covered by the GUI ownership section.

- CANDIDATE (adapter/overlays.js): 'Auth modal state and actions. The other overlays (context menu, emoji picker, command palette) are imperative globals re-exposed by nostr-adapter.js.' | docs/js/adapter/overlays.js:1-2 (original). Removed.
  Verdict: TRUE - Not kept: overlays.js:27-29 calls window.__zellous.generateKeyWithConfirm; header comment only.

- CANDIDATE (voice-ptt.js banner, SDK contract): 'voice-ptt.js — PTT mic gate + queue UI on top of wireweave 0.2 voice. Wireweave handles: speaker-activity detection, anti-overtalk transmit gate, per-peer data-channel segment broadcast. This file: drives requestTransmit / releaseTransmit on hold-start / release; renders inbound segment queue + plays segments FIFO; tracks transmit mode (live / queued / idle) as plain state, not DOM — the SDK's own .vx-ptt button (mountCommunityApp) is the visual surface; nostr-adapter.js's pttStart/pttStop actions call holdStart/holdEnd below and its state.pttState/pttLabel/pttDisabled feed the button's state/label/disabled props.' | docs/js/voice-ptt.js:1-10 (original). Removed. Note the 'wireweave 0.2' version reference is now stale against the @fbcee886 pin in index.html.
  Verdict: STALE - The "wireweave 0.2" label no longer maps to anything; the pin is fbcee886 (docs/nostr-chat/index.html:27).

- CANDIDATE (voice-ptt.js channel mode): 'Channel mode is published with the channel metadata (owner-controlled), so every participant sees the same mode. We read it off the live channel object from state; localStorage is only consulted as a last-ditch fallback for older clients that wrote there before the migration. A personal vadEnabled setting (Voice Settings modal) overrides the channel default to 'vad' for that user only — it's a client-side preference, not server-published state.' | docs/js/voice-ptt.js:32-38 (original). Removed.
  Verdict: UNVERIFIABLE - The channel-metadata mode source was not re-read; only the personal vadEnabled override is confirmed (voice-ptt.js:23).

- CANDIDATE (voice-ptt.js queueItems, SDK contract): "Shape matches the SDK's AudioQueue overlay contract (community.css .vx-queue, 247420.js's Oa()): {id, isLive, color, speaker, duration}. history first (oldest to newest) so the currently-playing/most-recent segment reads at the strip's trailing end, matching a chat-log's natural chronological order." | docs/js/voice-ptt.js:65-68 (original). Removed.
  Verdict: UNVERIFIABLE - The SDK AudioQueue item shape was not checked under design/src.

- CANDIDATE (voice-ptt.js inbound queue): "Inbound queue: segments arrive via dc; we play them FIFO through an <audio> element. Realtime listening is unaffected (the analyzer + mix of remote tracks happens via wireweave's own audioEls created by the onAudioTrack callback in wireweave-bridge.js)." | docs/js/voice-ptt.js:124-127 (original). Removed.
  Verdict: UNVERIFIABLE - Inbound queue behaviour was not re-read in this sweep.

- CANDIDATE (voice-ptt.js replaySegment): "Re-play a specific already-played segment on demand (SDK's AudioQueue chip strip lets the user tap any past segment, live or from history, to hear it again) -- distinct from the auto FIFO drain above, so it does not consume or reorder the live inbound queue." | docs/js/voice-ptt.js:188-191 (original). Removed.
  Verdict: UNVERIFIABLE - replaySegment behaviour was not re-read in this sweep.

- CANDIDATE (voice-ptt.js VAD and modes): "VAD mode: auto request/release transmit off wireweave's own local speaker-activity detector (real AnalyserNode RMS, not a stub), instead of the PTT pill's manual hold/release." and "Switch the pill / mic between PTT, VAD, and Realtime modes. In realtime mode we keep the mic open (lk.setMuted(false)) and the SDK's .vx-ptt button (fed by state.pttState/pttLabel/pttDisabled via nostr-adapter.js) shows a static 'Live mic' badge. In VAD mode the button is decorative (state driven by onLocalSpeaker) and hold/release is automatic." | docs/js/voice-ptt.js:226-228 and 237-241 (original). Removed. Note the 'Live mic' text in the removed comment does not match the applyMode label 'Live'.
  Verdict: STALE - The "Live mic" badge text has zero hits in docs/js; the badge the removed comment described is absent.

- CANDIDATE (voice-ptt.js segment-finalized): "segment-finalized just signals that the held buffer was packed up; transmit-mode is the source of truth for the pill, so we don't override it from here." | docs/js/voice-ptt.js:274-275 (original). Removed.
  Verdict: UNVERIFIABLE - Trivial; not re-read in this sweep.

- CANDIDATE (nostr-channels-ui.js _invalidInput): "Shared empty/invalid-field feedback for creation/rename forms: a brief shake + red border so a blocked submit (e.g. empty name) is visible instead of the button silently doing nothing." | docs/js/nostr-channels-ui.js:69-71 (original). Removed.
  Verdict: TRUE - Not kept: _invalidInput is at nostr-channels-ui.js:56 with call sites at :378 and :428 and nostr-servers-ui.js:148, :241, :293; obvious helper.

- CANDIDATE (nostr-channels-ui.js channel settings): "Unified channel-settings modal. Works for any channel type. Voice channels get an extra Mode (PTT/Realtime) section. The mode lives on the channel metadata so all participants see the same setting — it is not a per-user preference. Only the server owner can save; others see read-only." | docs/js/nostr-channels-ui.js:303-306 (original). Removed.
  Verdict: UNVERIFIABLE - Non-owner read-only rendering in nostr-channels-ui.js was not re-read.

- CANDIDATE (index.html, vendor path): "Use relative URLs to vendor directory (sibling of nostr-chat/)" — the importmap's '../vendor/' entries resolve relative to nostr-chat/. | docs/nostr-chat/index.html:17 (original). Removed.
  Verdict: TRUE - Not kept: docs/nostr-chat/index.html:20-26 use ../vendor/ relative paths. Candidate for AGENTS.md if room allows.

- CANDIDATE (index.html, boot reporter): "Boot reporter — exposed early so any code path can update progress / mark errors." and "Phases: tokens → modules (each script counts) → ready. Observable via window.__boot." | docs/nostr-chat/index.html:94-95 (original). Removed.
  Verdict: TRUE - Not kept: index.html:96 window.__boot is already named in the boot-status caveat.

- CANDIDATE (index.html, post-boot error toasts): "Post-boot safety net — an uncaught error/rejection after the splash is gone would otherwise be console-only and invisible to the user. Rate-limited to one toast per 5s so a repeating error doesn't spam the UI." | docs/nostr-chat/index.html:110-112 (original). Removed.
  Verdict: TRUE - Not kept: index.html:103 rate-limits runtime-error toasts to one per 5000 ms; obvious from the code.

- CANDIDATE (index.html, stall detection): "A slow/stalled fetch (as opposed to an outright error) never fires onload or onerror, so without this the generic 25s watchdog is the only signal -- and it can't name which file stalled. This surfaces the specific slow module well before that wall, in the console." | docs/nostr-chat/index.html:284-287 (original). Removed. The 8000 ms stall warning remains.
  Verdict: TRUE - Not kept: index.html:254 warns at 8000 ms; obvious from the code.

- CANDIDATE (index.html, boot overlay CSS): "Boot overlay — visible before any module CSS resolves. Inline so it never blocks on a fetch." and "Boot tokens — must paint before zellous.css; mirror its ink/paper palette." | docs/nostr-chat/index.html:68-69 (original, inside <style>). Removed.
  Verdict: UNVERIFIABLE - CSS load ordering cannot be checked by codesearch.

- CANDIDATE (index.html, legacy scaffold history): "SDK community-app render target. mountCommunityApp (anentrypoint-design) renders the full GUI here, driven by the Nostr adapter (js/nostr-adapter.js). The legacy hidden .app scaffold that used to sit below this mount point (dead duplicate chrome, still visible to screen readers / text extraction despite display:none) was deleted 2026-07-31 after auditing every feature module that read its DOM ids; see AGENTS.md's app-scaffold-cleanup history." | docs/nostr-chat/index.html:125-131 (original). Removed.
  Verdict: STALE - The pointer to "AGENTS.md's app-scaffold-cleanup history" names a section absent from the current AGENTS.md.
