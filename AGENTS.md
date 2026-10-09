# AGENTS.md — Operating Guide for Coding Agents

For the architecture reference read `CLAUDE.md` first; this file adds operational discipline only.

## Repo shape

Static GH-Pages app under `docs/`. Protocol logic is **`wireweave`**, loaded from the `AnEntrypoint/wireweave` GitHub repo through jsdelivr's `/gh/` CDN and the injected importmap, **pinned to commit `fbcee886afc492f95eba5d6d6efd7dab914b3125`**. No vendored copy, no submodule, no npm/unpkg dependency. Window globals are published by `docs/js/bridge/*.js`, run in order by `docs/js/wireweave-bridge.js`. No backend and no build for the app; `flatspace.config.mjs` and `site/` only build the marketing landing into `dist/`.

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

`https://cdn.jsdelivr.net/gh/AnEntrypoint/wireweave@fbcee886afc492f95eba5d6d6efd7dab914b3125/src/index.js`

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
- A fresh `@main` SDK push needs a browser session with an empty HTTP cache (`agent-browser --session <new>`); a reused profile keeps serving the previous `247420.js` for hours.
- The legacy hidden auth modal in `docs/nostr-chat/index.html` still has a `.modal-btn.danger` "Logout" button (`#nostrLogoutBtn`), so selectors for the `ui.confirm` dialog must be scoped to `[role=alertdialog]`.
- Chat history loads with `limit: 50` and no `since`; the live subscription starts at `since: now`. A message published with a back-dated `created_at` is visible only after a reload, so account for that when probing anything time-based.
- Not witnessed by any agent; needs a human on real hardware: iOS Safari safe-area and zoom, the on-screen keyboard, landscape on a notched iPhone, fling-scroll, long-press and swipe on message actions, and the left-edge drawer swipe. Say so in any report about mobile behaviour.

Deploy runs on every push to `main` (`.github/workflows/gh-pages.yml`). It is the only workflow; there is no CI validation job.

## Things that look broken but aren't

- **No `<script type="importmap">` in raw HTML.** It is injected at runtime by an early classic script in `docs/nostr-chat/index.html`. Static greps miss it; the importmap is real.
- **`docs/js/state.js` imports `@preact/signals`.** This works because `state.js` is loaded with `await import('../js/state.js')` from the bootstrap module script, by which time the importmap is injected.
- **`site/theme.mjs` embeds a browser importmap for `anentrypoint-design`** that loads from jsdelivr `@main`; there is no Node-side import. Don't vendor it locally.
- **`dist/index.html` differs from `docs/index.html`.** `docs/` is the live GH-Pages source; `dist/` is the flatspace build artifact.
- **Repo-insight banners may flag `server.js`, SQL or hardcoded creds.** The summary indexer caches an old project shape. The tree has no server, SQL or embedded credentials; verify before "fixing".
- **No `wireweave` under `docs/vendor/`.** It is resolved live at the pinned SHA; a plain `git clone` boots with no submodule step.

## Rules

- **No backend.** Don't introduce a Node server, an Express route, a database, or anything that needs a process running. Voice and chat go through public Nostr relays. Storage is `localStorage` plus relay-side events.
- **No new `window.X` outside the bridge.** Add a manager via wireweave, expose it through `docs/js/bridge/*.js`, mirror under `window.__zellous`. Don't sprinkle `window.foo = ...` in random modules.
- **No comments unless a future reader genuinely needs the *why*.** Don't narrate what the code already says.
- **No fallback / demo / mock modes.** If a probe needs real Nostr, run real Nostr.
- **No test files, anywhere.** Verification is live execution against the real page, never a test suite.
- **CRLF awareness.** When string-replacing in HTML files via `exec:nodejs`, use `\r?\n` in regexes — Git on Windows stores some HTML with CRLF.
- **Importmap edits must update *the inline injector script*** in `docs/nostr-chat/index.html`, not a literal `<script type="importmap">` (there isn't one).

## Non-obvious technical caveats

**Uploads go through Blossom for every file type.** `chat.sendImage()` routes any file through `window.nostrMedia.sendMedia()` (wireweave `src/media.js`): a direct browser `PUT` to a public Blossom server with NIP-98-style kind:24242 auth. The returned URL is embedded in a kind:42 message. Blossom has no type restriction; the 20MB cap is enforced in `media.js` and surfaced as a toast. `ui-actions.js`'s `handleFileSelect` and `files.js`'s paste and drag-drop handlers all use this path.

**gm's `browser` verb: if it CDP-times-out silently, read the launch log first.** The launch code is `AnEntrypoint/agentplug`'s `crates/agentplug-host/src/browser.rs` (not in this checkout), compiled into `~/.gm-tools/agentplug-runner`. `launch_chrome()` captures Chrome's output to `browser-chrome-profile-<session>/chrome-launch.log` and retries once with `--no-sandbox` on a sandbox denial. To reproduce from source, clone `AnEntrypoint/gm` (its `agentplug` submodule is the real source), `cargo build --release -p agentplug-runner`, and dispatch `browser` directly.

**The `browser` verb takes a `viewport=WxH\n` prefix** for device-viewport checks (a real CDP device-metrics override with touch emulation). Stack the prefixes in this order: `timeout=`, then `viewport=`, then `url=`, then the script body; out of order corrupts the parse. `@scale` (`375x667@2`) sets the device scale factor; a trailing `!desktop` disables mobile and touch emulation. The script body must `return` its value from inside an `(async()=>{...})()` wrapper.

**Playwright viewport API.** Under `exec:browser`, use `page.setViewportSize({width, height})`, not puppeteer's `page.setViewport()`.

**Windows path traversal checks** (dev servers): normalise with `path.resolve(ROOT)` and `path.resolve(path.join(ROOT, p))`; a raw `startsWith()` on mixed slashes fails.

**Enforcement points.** Bans, timeouts and personal mutes are enforced in wireweave's `chat.js` (send and both subscriptions) and `mutes.js` (NIP-51 kind:10000). A personal mute filters only the viewer's own view; an admin ban is server-wide. Chat deletions (NIP-09 kind:5) are honoured only for the original author or an owner, admin or moderator.

**Voice-state signals must be seeded on `'connected'`.** A reactive signal derived from wireweave CustomEvents must be seeded in the `'connected'` handler, not only on `'participants'`: a self-only join never fires the change event. `docs/js/bridge/voice.js` seeds `state.voiceParticipants` for this reason; `docs/js/adapter/voice.js` derives the SDK's `speaking`/`color` fields from wireweave's raw `isSpeaking` shape.

**Voice joins listen-only when there is no microphone.** `connect()` in wireweave `src/voice.js` catches the `getUserMedia()` failure and joins with a `recvonly` transceiver; the `media-warning` event becomes a toast in `docs/js/bridge/voice.js`.

**Voice settings apply on the next join.** Mode, device, RNNoise, AutoGain, ForceTURN and bitrate live in `state.js`; `docs/js/adapter/voice.js` passes them to `docs/js/bridge/voice.js` (`setAudioConstraints`, `setForceRelay`). No live renegotiation happens.

When wiring any adapter boolean the SDK's own render logic branches on (e.g. `mobileMenuOpen`, `memberListOpen`), verify the exact field name against the live `247420.js` bundle (`curl` + grep) rather than assuming a same-named zellous action drives the right signal — it's easy to have an action that only touches dead legacy DOM while the real signal stays unwired.

**Legacy overlays and inputs need a position rule.** `#videoPlayback` (toggled by `webcam.js`), `#settingsPopover` (toggled by `ui-actions.toggleSettings`) and `#fileInput.hidden-input` are still wired to legacy controllers. `zellous.css` gives them `position:fixed; display:none` (overlays, z-index 2600) and a visually-hidden 1px clip. Any always-present overlay or trigger added to `index.html` needs a `position` and hidden-by-default rule, or it sits in normal flow and inflates `document.body.scrollHeight`. Because `html,body { overflow:hidden }` is set, that inflation shows no scrollbar; verify with `document.body.scrollHeight <= window.innerHeight` in a browser witness.

**Legacy context menus need `.open`.** `docs/js/nostr-channels-ui.js`'s `_mkMenu(id, x, y, html, onAction)` must set `className = 'context-menu open'`; `zellous.css` shows `.context-menu` only with `.open`. Check any new legacy overlay against its CSS default-hidden state the same way.

**Rail group create buttons.** `railPill` in the design repo's `src/community-app.js` renders flat rooms/voice/servers groups. A group's create button shows only when `adapter.get().canManage` and `adapter.actions.createChannel` exist; zellous wires `createChannel` to `channelManager.showCreateModal`. Drag and Alt+Arrow reorder run through the rail's `reorderChannel` adapter action (`docs/js/adapter/rail.js`).

**Off-canvas surfaces take `inert`, not `aria-hidden`.** The rail and the member list take `inert` while closed. webjsx assigns `el[key] = null` as an expando for keys not `in el`, so a nulled `aria-hidden` attribute stays in the DOM.

**The 900px breakpoint is tracked in JS.** `docs/js/ui-shell.js` uses `matchMedia`, because crossing the breakpoint changes no signal and so triggers no re-render on its own.

**Untrusted Nostr text is escaped before `innerHTML`.** Server names and colours (kind:34550 tags) and channel type labels are attacker-controlled. Route them through `escHtml()` in `nostr-servers-ui.js` and `nostr-channels-ui.js`. Pages HTML goes through the SDK's DOMPurify-backed `sanitizeHtml()`; chat message text is inserted as text nodes.

**Overlay focus waits a task.** Move focus into a newly opened overlay with `setTimeout(fn, 0)`, not `queueMicrotask`: a microtask runs inside the triggering click, before the browser's focus-on-click settles, so focus can stay on the trigger and break Escape-to-close and the Tab trap. The design repo's overlays already follow this; keep new overlays on the same pattern.

**Disk-full destabilises the `browser` verb's chromium.** At 100% disk a `Write`/`Edit` can truncate a file to 0 bytes, and playwriter chromium can crash on long-busy operations. Recovery: (1) `git checkout -- <file>` for any truncated file; (2) close the browser session, stop only the orphaned `ms-playwright` chrome processes (match `*ms-playwright*` on the command line, never the user's personal Chrome), and `rm -rf .gm/browser-profile` if present (gitignored; recreated); (3) start a fresh session. Under disk pressure prefer short `waitForTimeout`-based witness bodies over long `waitForFunction` ones.

## Code invariants (from the comment sweep)

- `docs/js/bridge/chat.js`, `docs/js/bridge/forum.js`: `reactionsVersion` and `forumVersion` are listed in `SIGNALS` (`docs/js/adapter/signals.js`). `ui.render.all()` does not re-render the SDK, so a new reactive path must bump a listed signal.
- `docs/js/bridge/media.js`: call `window.chat.handleTextMessage`. The module-scope `chat` is `ww.chat` and lacks that method.
- `docs/js/bridge/network.js`, `docs/js/state.js`: `relayGrace` starts `true` to suppress the not-connected banner for 3s. The window is re-armed at `appReady`, since boot can take longer than 3s.
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
- `docs/js/voice-ptt.js`: the reason string `no-microphone` is a contract with wireweave `src/voice.js`, which emits it in `transmit-denied`.
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
    bridge/                          ←  install* modules that publish window globals (boot-status, chat, voice, ...)
    ui*.js                           ←  render
    *.js                             ←  feature modules (files, webcam, queue, moderation, …)
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

There is no local SDK copy and no vendored kit CSS; do not reintroduce one. Both pages link the bundled stylesheet `https://cdn.jsdelivr.net/gh/AnEntrypoint/design@main/dist/247420.css`, and the importmap maps `anentrypoint-design` to `https://cdn.jsdelivr.net/gh/AnEntrypoint/design@main/dist/247420.js`.

- The GitHub repo is `AnEntrypoint/design`; its npm package is `anentrypoint-design`. Don't confuse the two when building URLs.
- The bundle holds colors_and_type, app-shell, community, editor-primitives and community-app, all scoped under `.ds-247420`, which `<html class="ds-247420">` matches. Only `247420.css` is linked; the source cssParts are bundle inputs. A class missing from the bundle renders unstyled with no error, so confirm it is in `dist/247420.css` after an SDK change.
- To propagate an SDK change: run `node scripts/build.mjs` in the design repo, commit the rebuilt `dist/247420.{js,css}` (both are tracked; the design `.gitignore` excludes only `dist/index.html` and `dist/.nojekyll`), and push to `main`. zellous picks it up on the next page load.
- Tradeoff: boot depends on `cdn.jsdelivr.net`. The SDK import is in try/catch: on failure it sets `window.__sdk = null`, calls `window.__boot?.fail(...)` and rethrows, so the boot screen shows a message.
- `package.json` declares no `anentrypoint-design` entry; nothing in the Node build imports the SDK.
- `gmsniff` (vendors a kit subset, makes zero external-origin runtime fetches, must run air-gapped) and `agentgui` (vendors the built kit for offline operation) stay excluded from CDN loads. Do not convert either.
- A floating `@main` load means a design push can change zellous's UI with no zellous commit. That is intended for the SDK; wireweave is pinned because it is not.
- jsdelivr `/gh/@main` purge is rate-limited per path: verify a fresh SDK push against a `@<sha>` URL instead of polling `@main`.

Two `design` CI gates apply before pushing an SDK change. The RTL lint (`scripts/lint-rtl-physical-properties.mjs`, run from `scripts/lint-css.mjs`) compares the physical-declaration count with the frozen baseline in `scripts/lint-rtl.baseline.json` (321): write logical properties (`inset-inline-*`, `margin-inline-start`, `text-align: end`), not `left`/`right`; `env(safe-area-inset-left)` names stay physical. Adding or renaming a component prop makes `docs/component-props.md` stale: run `node scripts/generate-component-docs.mjs` (plus `generate-component-types.mjs`, `generate-component-manifest.mjs`, `gen-exports.mjs`) and commit the result with the change.

**SDK components reach consumers as `C.X` only via the barrel.** `src/components.js` does `import * as components`, so a new export must be re-exported there. A consumer that polls for `!sdk.C.Foo` (see `docs/js/sdk-command-palette.js`) stays dead with no error, not a crash.

**Dev servers must send MIME types.** Browsers refuse ES modules served without `text/javascript`. `scripts/dev-server.mjs` sets them.

**Design tokens only.** `zellous.css` uses design tokens (`--bg`, `--fg`, `--accent`, `--green`, ...) from the bundled `247420.css` and defers layout to the SDK. Don't hardcode colours or add layout overrides for SDK classes. Overrides that match SDK selectors lose on specificity (an ink-theme token block beats a plain `:root` rule), so check computed values in a browser witness.

## Working discipline

- Under concurrent pushes to `design` or `zellous`, fetch, check the diff for disjoint changes and re-apply; don't force-push. Don't trust a `prd-resolve` success response alone under concurrent load; spot-check `.gm/prd.yml`.
- A fix round is evidence of progress, not convergence. Re-verify fixes with a reviewer that reads only the diffs.
- A "surely fine" mechanical deletion (a script tag and its module) still needs the live boot witness, not just a parse-check.

Dated audit narratives, fixed-bug notes and the learning-audit log are in `docs/notes/agents-history.md`.

@.gm/next-step.md
