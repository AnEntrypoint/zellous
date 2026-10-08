# AGENTS.md — Operating Guide for Coding Agents

This file is for agents (Claude Code, etc.) working in this repo. For the architecture reference, read `CLAUDE.md` first; this file only adds operational discipline.

## Repo shape (one-liner)

Static GH-Pages app under `docs/`. Real protocol logic is **`wireweave`**, loaded from the `AnEntrypoint/wireweave` GitHub repo through jsdelivr's `/gh/` CDN and the injected importmap, **pinned to commit `f49c41e2dd0a336a31dd0dc75a6daffb9e03eb23`** (see the next section). There is no vendored copy, no submodule, and no npm/unpkg dependency. Window globals are wired in `docs/js/wireweave-bridge.js`. No backend, no build for the app itself; `flatspace.config.mjs` + `site/` only build the marketing landing into `dist/`.

## What you almost certainly want to edit

| Goal | Edit here |
|---|---|
| Change UI render / layout for the whole app | edit `anentrypoint-design`'s `mountCommunityApp` (see GUI ownership section) — only `docs/js/sdk-command-palette.js` survives as a subtree mount |
| Change zellous-side actions/state feeding the SDK | `docs/js/nostr-adapter.js` (adapter contract), `docs/js/ui-actions.js`, `docs/js/state.js`, `docs/css/zellous.css` |
| Change protocol behavior (Nostr events, voice signaling, etc.) | the `AnEntrypoint/wireweave` repo, push to `main`, then bump the pinned commit SHA in zellous (two places, see "wireweave is pinned"). zellous does not pick up a wireweave push by itself. |
| Expose / rename a window global | `docs/js/wireweave-bridge.js` (mirror under `window.__zellous`) |
| Add a vendored dep (not wireweave) | `scripts/fetch-vendor.js`, then add an importmap entry inside the inline injector script in `docs/nostr-chat/index.html` |
| Touch state | `docs/js/state.js` (single source of truth for signals) |
| Improve an SDK component (or add a missing one) | edit the `AnEntrypoint/design` repo's `src/components/*.js` + the relevant cssPart (`community.css`/`editor-primitives.css`/`app-shell.css`/`community-app.css`), re-export from `src/components.js` (barrel re-export is what makes it `C.X`), run `node scripts/build.mjs`, then **commit the rebuilt `dist/247420.{js,css}` and push the SDK repo to `main`**. zellous loads `https://cdn.jsdelivr.net/gh/AnEntrypoint/design@main/dist/247420.{js,css}` live, so there is no re-vendor step and no zellous commit (see the SDK section). |
| Marketing landing | `docs/index.html` (live) and/or `site/` + `flatspace.config.mjs` (CI-built `dist/`) |

## wireweave is pinned to a commit on jsdelivr's `/gh/` CDN

zellous has **no wireweave submodule, no vendored wireweave copy, and no npm dependency on it**. The inline importmap injector in `docs/nostr-chat/index.html` maps the bare specifier `wireweave` to

`https://cdn.jsdelivr.net/gh/AnEntrypoint/wireweave@f49c41e2dd0a336a31dd0dc75a6daffb9e03eb23/src/index.js`

and `docs/js/wireweave-bridge.js` does `await import('wireweave')` and calls `mod.createWireweave({...})`. `package.json` carries no `wireweave` entry; the browser is the only consumer.

**The entry is pinned to a commit SHA, not `@main`.** Reason: a mixed-version jsdelivr tree (wireweave `src/` files resolved from different commits) broke boot, and the pin makes the loaded tree one fixed commit (verified live). f49c41e is the wireweave `main` tip at the time of this change ("fix(voice): do not elect a hub on claims made by remote peers", 2026-10-08). A wireweave push therefore does **not** change zellous's behavior until zellous bumps the pin.

Both pin sites must move together:
- `docs/nostr-chat/index.html`: the `wireweave:` entry of the injector's `imports` map.
- `scripts/dev-server.mjs`: `CDN_WIREWEAVE`, which rewrites that URL to the sibling checkout under `npm run dev:local`.

**Bump procedure:**
1. Commit and push `AnEntrypoint/wireweave` to `main`; take the full 40-character SHA.
2. Replace the SHA in both sites above. Confirm with a codesearch for `wireweave@` in this repo that only those two lines carry a SHA.
3. Re-verify boot against the production CDN path (not `--local`) in a fresh browser session with an empty HTTP cache: `window.appReady===true`, zero console errors (Google Fonts failures excepted), and `window.__boot` not in the failed state.
4. Commit the bump in zellous.

**Tradeoffs:** boot depends on `cdn.jsdelivr.net` being reachable. If the protocol layer fails to load, `wireweave-bridge.js` reports `window.__boot?.fail(...)` and rethrows; wireweave is the whole protocol layer, so there is no degraded mode. To test an unpinned or local wireweave, run `npm run dev:local`, which repoints the importmap at `/config/workspace/wireweave`.

wireweave takes its dependencies by injection (`createWireweave({ nostrTools, xstate, storage, ... })`, and `NostrAuth` throws `nostrTools required` rather than importing it), and every module under its `src/` imports only relative siblings. The CDN-served entry therefore emits no bare specifier for the importmap to resolve; `nostr-tools` and `xstate` keep their local `../vendor/` entries.

## GUI ownership: the SDK owns the whole app (`mountCommunityApp`)

The entire chat/community GUI lives in `anentrypoint-design`. `src/community-app.js` exports `mountCommunityApp(root, adapter)`, which composes every surface (topbar, server+channel rail, chat body, member list, voice view with grid/controls/ptt/vad/webcam, user panel, and all overlays: context-menu, emoji-picker, command-palette, auth-modal, boot-overlay, settings-popover, voice-settings-modal, video-lightbox, audio-queue, thread-panel; channel-type bodies forum/page) and wires them to an injected `adapter`. It is barrel-exported (`window.__sdk.C.mountCommunityApp`) and styled by the `community-app.css` cssPart (`.ca-app`/`.ca-rail`/`.group`/`.rail-empty`/`.vx-view` + `--cat-*` tokens). A reference kit lives at `ui_kits/community-app/` (mock adapter, no backend). The adapter fields are documented in the `mountCommunityApp` entry of the design repo's `AGENTS.md`.

**zellous is a thin consumer.** `docs/js/nostr-adapter.js` maps `window.stateSignals` (preact signals) + the feature-module actions (chat/lk/serverManager/channelManager/moderation/auth/queue/ui) to the adapter contract `{get()->snapshot, subscribe(cb), actions, helpers}` and calls `mountCommunityApp(#app, adapter)`. `subscribe` registers a `window.__effect` over the reactive signals so any change re-renders. The imperative overlay globals (`__contextMenu`/`__emojiPicker`/`__commandPalette`) are re-exposed from the returned `app.api`. The legacy `.app` scaffold is gone from `index.html`, so no dead `display:none` markup remains. The old `docs/js/sdk-*.js` mount IIFEs are deleted; only `docs/js/sdk-command-palette.js` remains, still listed in `index.html`'s `scripts[]`. To change the GUI, edit `anentrypoint-design` (additively) and let gh-pages redeploy.

**Adapter contract** is documented in the design repo (see above). To add a surface: compose it in `mountCommunityApp` reading from the adapter, add any new adapter field, and map it in `nostr-adapter.js`.

### Final cleanup deferred (high blast radius)

- Deleting `docs/css/zellous.css` entirely — must wait until every surface above is migrated.
- Switching from subtree mounts to top-level `mount(#app)` — same prerequisite.

Until then, `zellous.css` co-exists with the SDK's `community.css` (the SDK's `cm-*` classes don't collide with zellous's class names).

If you find yourself editing anything under `docs/vendor/`, stop — that's a third-party drop, not first-party code. Protocol behavior changes belong in the `wireweave` sibling repo (`../wireweave`), consumed live over CDN at the pinned SHA, not vendored.

## Verification (live runs only)

No hard-coded validations and no test files. Verify behaviour by running the real system and reading the observed output. Do not add scripts or CI jobs that encode pass/fail checks.

- `node scripts/drive.mjs <probe.js> --local` (or `--expr "<js>"`, or `--url <absolute URL>`) runs a page-context script against the live app and prints its return value and console errors. `--local` serves the sibling wireweave and design checkouts; without it the app loads them from the pinned jsdelivr URLs.
- Parse-check a file by hand with `node --check <file>`.
- Report what you observed, with the command and its output. Do not summarise a result you did not see.

There is no CI workflow. Deploy runs on every push to `main` (`.github/workflows/gh-pages.yml`).

## Things that look broken but aren't

- **No `<script type="importmap">` in raw HTML.** It is *injected at runtime* by an early classic script in `docs/nostr-chat/index.html`. Static greps will miss it; the importmap is real.
- **`docs/js/state.js` imports `@preact/signals`.** This works because (a) `state.js` is loaded via `await import('../js/state.js')` from inside the bootstrap module script, and (b) by that time the importmap has been injected.
- **`site/theme.mjs` embeds a browser importmap for `anentrypoint-design`** that loads from jsdelivr `@main`; there is no Node-side import. Don't try to vendor it locally.
- **`dist/index.html` differs from `docs/index.html`.** Different surfaces. `docs/` is the live GH-Pages site; `dist/` is the flatspace build artifact.
- **Repo-insight banners may flag `server.js`, SQL, hardcoded creds, etc.** The summary indexer caches old project shape. The current repo has no server, no SQL, no embedded credentials. Verify against the actual tree before "fixing".
- **No `wireweave` under `docs/vendor/`.** It is resolved live from the `AnEntrypoint/wireweave` repo at the pinned SHA via jsdelivr's `/gh/` CDN, not a vendored directory. A plain `git clone` is complete and boots with no submodule step.

## Rules

- **No backend.** Don't introduce a Node server, an Express route, a database, or anything that needs a process running. Voice and chat go through public Nostr relays. Storage is `localStorage` plus relay-side events.
- **No new `window.X` outside the bridge.** Add a manager via wireweave, expose it through `wireweave-bridge.js`, mirror under `window.__zellous`. Don't sprinkle `window.foo = ...` in random modules.
- **No comments unless a future reader genuinely needs the *why*.** Don't narrate what the code already says.
- **No fallback / demo / mock modes.** If a probe needs real Nostr, run real Nostr.
- **No test files, anywhere.** Verification is live execution against the real page, never a test suite.
- **CRLF awareness.** When string-replacing in HTML files via `exec:nodejs`, use `\r?\n` in regexes — Git on Windows stores some HTML with CRLF.
- **Importmap edits must update *the inline injector script*** in `docs/nostr-chat/index.html`, not a literal `<script type="importmap">` (there isn't one).

## Non-obvious technical caveats

**Generic file uploads go through Blossom for every file type.** `chat.sendImage()` (`wireweave-bridge.js`) routes any file through `window.nostrMedia.sendMedia()`, backed by wireweave's `Media` class (`../wireweave/src/media.js`): a direct browser `fetch`/`PUT` to a public Blossom server (NIP-98-style signed kind:24242 auth, no backend of ours), which returns a URL embedded as the content of a normal kind:42 channel message. Blossom has no type restriction, only a 20MB cap enforced in `media.js` and surfaced as a toast. `ui-actions.js`'s `handleFileSelect` and `files.js`'s paste/drag-drop handlers all use this path. `files.js` no longer has a chunked/base64 upload; its old implementation depended on `state.ws`, which is always null in Nostr mode.

**gm's `browser` verb: if it CDP-times-out silently, check the launch log first.** The browser-launch code is `AnEntrypoint/agentplug`'s `crates/agentplug-host/src/browser.rs`, compiled into `~/.gm-tools/agentplug-runner` (`~/.gm-tools/plugkit-wasm-wrapper.js` is a deprecated file that is not on the real path). The sandbox failure mode (Chrome exiting with `No usable sandbox!` in containers) is fixed upstream: `launch_chrome()` captures Chrome's output to `browser-chrome-profile-<session>/chrome-launch.log` and retries once with `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage` on a sandbox denial (agentplug commit `124fadf`). If the verb times out again, read that log first; to reproduce from source, clone `AnEntrypoint/gm` (its `agentplug` submodule is the real source), `cargo build --release -p agentplug-runner`, then dispatch `browser` directly.

**gm's `browser` verb supports a `viewport=WxH\n` prefix for mobile/device-viewport testing.** Stack it in the same body-prefix chain as `timeout=`/`url=` (order matters: `timeout=`, then `viewport=`, then `url=`, then the script body — a prefix out of order is left unstripped and corrupts the downstream script/URL parse into a `SyntaxError`). `viewport=375x667\n` applies a real CDP `Emulation.setDeviceMetricsOverride` (+ touch emulation) before navigation, so responsive-CSS breakpoints can be exercised directly (e.g. `.app-topbar nav` is `display:none` at 375×667 and `display:flex` at 1280×800). Optional `@scale` suffix sets `deviceScaleFactor` (`375x667@2`); optional trailing `!desktop` disables mobile/touch emulation for a custom-but-non-mobile viewport. The script body must `return` its value from inside the `(async()=>{...})()` wrapper — a bare trailing expression is discarded, not returned.

**Bans, timeouts and personal mutes are enforced in text chat, not only in voice.** `wireweave/src/chat.js`'s `send()` rejects (emitting `send-blocked`) when the sender is banned or timed out in the current server. Both the history-load and live-message subscriptions drop events from banned, timed-out and personally-muted authors before they reach the message list, as defense in depth against a bypassing client. Personal mutes are a NIP-51 kind:10000 list (`wireweave/src/mutes.js`, one `Mutes` per session, `.load()` at boot, deferred via the auth object's `'login'` event if `auth.pubkey` is not populated yet). A personal mute affects only the viewer's own view; an admin ban is server-wide.

**Message deletion (NIP-09 kind:5) is applied to other viewers.** `wireweave/src/chat.js` subscribes to `chat-deletions-<channelId>` (in `loadHistory()`), and honors a deletion only when the deleter is the original author or holds the owner, admin or moderator role. A kind:5 carries only the deleted message's id, so the channel check happens client-side against the locally cached message list; a deletion that arrives before its message is kept in `_pendingDeletes`.

Any reactive voice-state signal derived from wireweave CustomEvents must be seeded on `'connected'`, not only on later change events (`'participants'`) — a self-only join is the one case where those change events never fire. `docs/js/wireweave-bridge.js` seeds `state.voiceParticipants` in its `'connected'` handler for this reason; `docs/js/nostr-adapter.js`'s `voiceParticipants` mapping derives the SDK's `speaking`/`color` fields from wireweave's raw `isSpeaking`/no-color shape.

**Voice join works without a microphone.** `wireweave/src/voice.js`'s `connect()` catches a `getUserMedia()` failure, leaves `localStream` `null`, and joins with a `recvonly` transceiver. A `media-warning` event (shown as a toast in `wireweave-bridge.js`) tells the user they joined listen-only.

**Voice settings apply on the next join.** Mode, device, RNNoise, AutoGain, ForceTURN and bitrate are stored in `state.js`, and `nostr-adapter.js`'s `openVoiceSettings`/`voiceSettingsSave` pass them to `wireweave-bridge.js` (`setAudioConstraints`, `setForceRelay`). No live peer-connection renegotiation happens; a change takes effect on rejoin.

When wiring any adapter boolean the SDK's own render logic branches on (e.g. `mobileMenuOpen`, `memberListOpen`), verify the exact field name against the live `247420.js` bundle (`curl` + grep) rather than assuming a same-named zellous action drives the right signal — it's easy to have an action that only touches dead legacy DOM while the real signal stays unwired.

**Windows static dev server path traversal** — When implementing path traversal checks for a dev server on Windows, use `path.resolve(ROOT)` + `path.resolve(path.join(ROOT, p))` for normalization. Raw `startsWith()` on forward-slash ROOT vs backslash-joined paths fails because backslashes don't normalize correctly for string comparison.

**Playwriter (exec:browser) viewport API** — playwriter uses Playwright's `page.setViewportSize({width, height})`, NOT puppeteer's `page.setViewport()`. The method name and parameter structure differ. Ensure viewport manipulation code targets Playwright, not puppeteer.

**Legacy overlays and inputs with no `position` rule inflate `document.body.scrollHeight`.** The legacy DOM still wired to legacy controllers (`#videoPlayback` toggled by `webcam.js`, `#settingsPopover` toggled by `ui-actions.toggleSettings`, `#fileInput.hidden-input`) must keep an explicit rule: `zellous.css` positions `.video-playback` and `.settings-popover` as `position:fixed; display:none` overlays (z-index 2600) and `.hidden-input` as a visually-hidden 1px clip. Any always-present overlay or trigger element added to `index.html` needs a `position:fixed`/`absolute` plus hidden-by-default rule, or it sits in normal flow and inflates body height. Because `html,body { overflow:hidden }` is set, the inflation shows no scrollbar. Verify with `document.body.scrollHeight <= window.innerHeight` in a browser witness.

**Legacy context menus need `.open`.** `docs/js/nostr-channels-ui.js`'s shared `_mkMenu(id, x, y, html, onAction)` must set `className = 'context-menu open'`; `zellous.css` shows `.context-menu` only with `.open`. Any new legacy DOM overlay should be checked against its CSS's default-hidden state the same way.

**The rail's channel groups.** `mountCommunityApp`'s rail (`railPill` in the design repo's `src/community-app.js`) renders flat "rooms"/"voice"/"servers" groups. Each group header carries a create button that shows only when `adapter.get().canManage` and `adapter.actions.createChannel` are present; zellous wires `createChannel` to `channelManager.showCreateModal`. The unused `ChannelSidebar` export in the SDK is not mounted.

**Pages are created from the server context menu.** Page channels are synthesized from kind 30078 events (`pageChannels()` in `nostr-adapter.js`), not by the regular channel flow. "Create Page" is in the owner-gated server context menu, and editing uses `showEditPageModal` (title plus HTML textarea).

**Forum posts** (kind:11 thread roots, NIP-22 kind:1111 replies, `wireweave/src/forum.js`) are scoped to a channel by the same hashed-channel-tag discipline as kind:42 messages. `threadManager.select()` routes forum-type channels to `selectForumPost()`, because a forum post id is never a real channel id. Replies are flat by design (each reply tags the root post only).

**Reactions** (NIP-25, kind:7): `wireweave/src/reactions.js` aggregates client-side keyed by the last `e` tag, last-write-wins per pubkey and target. `window.nostrReactions` (`getFor`/`react`/`unreact`) feeds each message's `reactions` field in `nostr-adapter.js`.

**Untrusted Nostr text is escaped before `innerHTML`.** Server names and colors (kind:34550 tags) and channel type labels are attacker-controlled. Route every such value through `escHtml()` in `nostr-servers-ui.js` and `nostr-channels-ui.js`. Pages HTML goes through the SDK's DOMPurify-backed `sanitizeHtml()`, and chat message text is inserted as text nodes.

**Focus moved into a newly opened overlay must wait a task.** Use `setTimeout(fn, 0)`, not `queueMicrotask`: a microtask runs inside the triggering click, before the browser's own focus-on-click settles, so focus can stay on the trigger and break Escape-to-close and the Tab trap. This is fixed in the design repo's overlays (SettingsPopover, EmojiPicker, Popover, ContextMenu, Drawer, Dialog, VideoLightbox); keep new overlays on the same pattern.

**Disk-full destabilizes the `browser` verb's chromium.** At 100% disk, a `Write`/`Edit` can truncate a file to 0 bytes (ENOSPC mid-write), and playwriter chromium can crash on long-busy operations. Recovery: (1) `git checkout -- <file>` to restore truncated files; (2) close the browser session, stop only the orphaned `ms-playwright` chrome processes (filter the command line for `*ms-playwright*`; never the user's personal Chrome), and `rm -rf .gm/browser-profile` (gitignored, recreatable); (3) start a fresh session. Under disk pressure, prefer short `waitForTimeout`-based witness bodies over long `waitForFunction` ones.

## Quick path map

```
docs/
  index.html                         marketing landing (live)
  nostr-chat/index.html              the app (live); holds the importmap injector
  js/                                first-party UI + bridge + state
    wireweave-bridge.js              ←  exposes all window globals
    state.js                         ←  ESM, signals, window.state/config
    nostr-adapter.js                 ←  adapter contract for mountCommunityApp
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

**How `docs/` reaches production (`dist/` is not just the marketing landing).** `.github/workflows/gh-pages.yml` runs `npx --yes flatspace@1.0.23 build` and uploads `./dist` as the Pages artifact; Pages serves `dist/` directly, not `docs/`. `site/theme.mjs`'s `assets` map (`'../docs/nostr-chat': 'nostr-chat'`, plus `docs/vendor`, `docs/css`, `docs/js`, `docs/msgpackr.min.js`) copies those paths from `docs/` into `dist/` verbatim at build time; flatspace only renders `dist/index.html` (the landing) from `site/content/`. So `docs/` is the source of truth you edit, and `dist/nostr-chat/` is a straight copy of `docs/nostr-chat/` produced on every deploy.

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

**SDK component reaches consumers as `C.X` only via the barrel** — `src/components.js` does `import * as components` and a consumer reads `sdk.C.X`. A new `export function Foo` in a component file is invisible until re-exported from `src/components.js`. A consumer that polls `setTimeout(init,30)` on `!sdk.C.Foo` (see `docs/js/sdk-command-palette.js`) stays dead with no error, so a missing barrel re-export is a silently dead feature, not a crash.

**Static dev server must set MIME types** — When serving `docs/` locally for module script testing, the dev server must send explicit `Content-Type` headers (e.g. `text/javascript` for `.js` files). Browsers enforce strict MIME checking for ES modules and will refuse to execute scripts served without the correct type, even if the file content is correct. `scripts/dev-server.mjs` does this.

**The validation-loop snippet 2 at port 5173 is the exception.** The `.mjs` files it serves need `text/javascript`, which the snippet sets explicitly. If you copy an older snippet that omits the MIME map, `.mjs` module loads fail; use port 5175 or add the MIME map.

**Design tokens as CSS variables** — `zellous.css` uses only design tokens (`--bg`, `--fg`, `--accent`, `--green`, etc.) sourced from `tokens.css` and `247420.css`. It is token-only and defers layout to the SDK; the legacy layout stylesheets are gone and must not come back. Don't hardcode colors or add layout overrides for SDK classes. Overrides that match the SDK's own selectors lose on specificity (for example, an ink-theme token block in the SDK beats a plain `:root` rule), so check the computed value in a browser witness, not just the CSS.

## Learning audit

Audit history from 2026-04-30 through 2026-08-11 (cold-start sampling, several adversarial audit sessions, and the CDN-independence migration) is summarized in rs-learn; the durable outcomes are the rules above and the code itself. Process notes that still apply:

- Under concurrent pushes to `design`/`zellous`, fetch, diff for disjoint changes, and re-apply rather than force-pushing. Don't trust a `prd-resolve` success response alone under concurrent load; spot-check `.gm/prd.yml`.
- A fix round is evidence of progress, not convergence. Re-verify fixes with a reviewer that reads only the diffs.
- A "surely fine" mechanical deletion (removing a script tag and its module) still needs the live boot witness, not just the parse-check. An earlier deletion of `docs/js/audio.js` left a stray reference that threw on every boot, and only the browser witness caught it.

2026-10-06: restored the documented CDN consumption (a repo re-init had left stale vendored `docs/vendor/{design,wireweave}` copies, a dead `.gitmodules` and a root `test.js`; all removed). `zellous.css` was rewritten from 839 layered `!important` lines to a lean file that defers chat, composer and message layout to the SDK; the legacy `#drawerOverlay` is gone. Added a display-name modal (`auth.setDisplayName`, kind:0) and a direct-message home (`dmView()` in `nostr-adapter.js` feeds the SDK's `dmConversations`/`activeDmPeer`/`newDm`/`selectDm` contract). jsdelivr `/gh/@main` purge is rate-limited per path: verify a fresh SDK push against a `@<sha>` URL instead of polling `@main`.

2026-10-06 (verification note): live witnessing of a fresh `@main` push needs a browser session with an empty HTTP cache (`agent-browser --session <new>`); a reused profile keeps serving the previous `247420.js` for hours and makes a landed fix look undeployed. The legacy hidden auth modal in `index.html` still contains a `.modal-btn.danger` "Logout" button, so selectors for the new `ui.confirm` dialog must be scoped to `[role=alertdialog]`.

2026-10-06 (engine coverage): Safari's engine is testable without root -- Playwright's `ubuntu24.04-x64` WebKit fallback build (`PLAYWRIGHT_HOST_PLATFORM_OVERRIDE`) plus noble `.deb`s extracted with `dpkg -x` into `minibrowser-wpe/sys/lib` (its wrapper script overwrites `LD_LIBRARY_PATH`, so only `sys/lib` works), driven with `playwright-core` and the `iPhone 15` profile (real touch, coarse pointer). It found two bugs Chromium and Firefox hid: SVG icons inside flex buttons collapsed to 4px wide (`svg.ds-icon { flex-shrink: 0 }` in the design repo) and off-canvas drawers letting the page pan sideways (`.ca-app { position: relative; overflow: hidden }` at mobile widths). Firefox 157 plus geckodriver (tarball from download.mozilla.org, extracted with python `lzma`) also runs headless for real-keyboard checks.

2026-10-06 (hardware-only checks, never witnessed by an agent): safe-area handling was verified only by substituting `env(safe-area-inset-*)` with 47px/34px in the served CSS under WebKit (header content clears the top inset, composer clears the bottom inset); the on-screen keyboard only by shrinking the viewport. Still needs a human on real iOS Safari and Android Chrome: focus the composer and confirm the page does not zoom and the composer stays above the keyboard; rotate to landscape on a notched iPhone; fling-scroll a long channel; long-press and swipe on message actions; open the drawer with a left-edge swipe (implemented in `ui-shell.js`, verified only with synthetic CDP touches in Chromium, never a real finger).

2026-10-07 (GUI audit pass, three repos): `zellous` and `design` are on `main`; `design` is consumed at `@main`, and `wireweave` is pinned (see above). A user-perspective audit over the live page fixed what it found. Channel reorder now lives in the rail's own `railPill` (drag and Alt+Arrow), via `A.reorderChannel`, which republishes the destination category's full sibling list so a cross-category drop lands in the target category. The mobile hamburger toggles the drawer instead of only opening it. Off-canvas surfaces (the rail and the member list) take `inert` while closed, not `aria-hidden`: webjsx assigns `el[key] = null` as an expando for keys not `in el`, so a nulled `aria-hidden` attribute stays in the DOM. The 900px breakpoint is tracked in JS via `matchMedia`, because crossing it changes no signal and so triggers no re-render on its own. The mobile header carries the current server name ahead of the channel name, since below 900px the rail is off-canvas. Unread badges: `wireweave/src/unread.js` opens one subscription per server covering every text channel's `#e` tag, counts events newer than a per-channel persisted last-read, and marks the active channel read as messages land. `scripts/audit-ui.mjs` skips controls scrolled outside their scrollport and hover-only (`opacity: 0`) chrome, files occlusion by an open drawer under `behindOpen`, credits a focus ring drawn on an ancestor, and reports the tappable row next to an undersized control.

The chat thread shows day separators (`Today`/`Yesterday`/`October 3`) from `design`'s `threads.js`; they render only for `variant === 'community'` (set only by `community-app.js`) and only on a numeric `ts`. Chat history loads with `limit: 50` and no `since`, and the live subscription starts at `since: now`, so a message published with a back-dated `created_at` is only visible after a reload -- worth knowing when probing anything time-based.

Two `design` CI gates to know before pushing an SDK change: the RTL lint (`scripts/lint-rtl-physical-properties.mjs`, run from `scripts/lint-css.mjs`) compares the physical-declaration count against the frozen baseline in `scripts/lint-rtl.baseline.json` (currently 321), so new `left`/`right`/`margin-left`/`text-align: left` in CSS fails the build; write the logical property (`inset-inline-*`, `margin-inline-start`, `text-align: end`) instead, and `env(safe-area-inset-left)` names stay physical. And adding or renaming a component prop makes `docs/component-props.md` stale: run `node scripts/generate-component-docs.mjs` (plus `generate-component-types.mjs`, `generate-component-manifest.mjs`, `gen-exports.mjs`) and commit the result in the same change.

@.gm/next-step.md
