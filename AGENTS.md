# AGENTS.md — Operating Guide for Coding Agents

This file is for agents (Claude Code, etc.) working in this repo. For the architecture reference, read `CLAUDE.md` first; this file only adds operational discipline.

## Repo shape (one-liner)

Static GH-Pages app under `docs/`. Real protocol logic is the **`wireweave` npm package**, loaded straight from unpkg `@latest` via the injected importmap — there is no vendored copy and no submodule. Window globals are wired in `docs/js/wireweave-bridge.js`. No backend, no build for the app itself; `flatspace.config.mjs` + `site/` only build the marketing landing into `dist/`.

## What you almost certainly want to edit

| Goal | Edit here |
|---|---|
| Change UI render / layout for the whole app | edit `anentrypoint-design`'s `mountCommunityApp` (see GUI ownership section) — only `docs/js/sdk-command-palette.js` survives as a subtree mount |
| Change zellous-side actions/state feeding the SDK | `docs/js/nostr-adapter.js` (adapter contract), `docs/js/ui-actions.js`, `docs/js/state.js`, `docs/css/zellous.css` |
| Change protocol behavior (Nostr events, voice signaling, etc.) | the `AnEntrypoint/wireweave` repo, then publish it to npm. zellous picks the new build up from unpkg `@latest` on the next page load, with no commit in zellous. See "wireweave is an npm package" below. |
| Expose / rename a window global | `docs/js/wireweave-bridge.js` (mirror under `window.__zellous`) |
| Add a vendored dep (not wireweave) | `scripts/fetch-vendor.js`, then add an importmap entry inside the inline injector script in `docs/nostr-chat/index.html` |
| Touch state | `docs/js/state.js` (single source of truth for signals) |
| Improve an SDK component (or add a missing one) | edit the `anentrypoint-design` repo's `src/components/*.js` + the relevant cssPart (`community.css`/`editor-primitives.css`/`app-shell.css`), re-export from `src/components.js` (barrel re-export is what makes it `C.X`), run `node scripts/build.mjs`, then **commit + push the SDK repo** (npm publish). unpkg's `@latest` CDN build (`https://unpkg.com/anentrypoint-design@latest/dist/247420.{js,css}`) is what zellous consumes live — there is **no re-vendor step in zellous anymore** (see SDK-load note below). |
| Marketing landing | `docs/index.html` (live) and/or `site/` + `flatspace.config.mjs` (CI-built `dist/`) |

## wireweave is an npm package loaded from unpkg `@latest`

zellous has **no wireweave submodule and no vendored wireweave copy**. The injected importmap in
`docs/nostr-chat/index.html` maps the bare specifier to
`https://unpkg.com/wireweave@latest/src/index.js`, exactly the way it already maps
`anentrypoint-design`, and `docs/js/wireweave-bridge.js` does a plain `await import('wireweave')`.
`package.json` declares `"wireweave": "latest"` for the same reason it declares the kit at `latest`
— a declaration of record, never a caret range that would freeze on the `0.3.x` line.

This works because **wireweave takes its dependencies by injection rather than importing them**:
`createWireweave({ nostrTools, xstate, storage, ... })`, and `NostrAuth` throws `nostrTools required`
rather than resolving it itself. Every module under its `src/` imports only relative siblings, so a
CDN-served entry emits no bare specifier the importmap would have to satisfy — `nostr-tools` and
`xstate` stay on their existing local `../vendor/` entries, independent of how wireweave is
delivered. Only `src/`, `README.md` and `LICENSE` are published, so never expect the repo's
`test.js`, `AGENTS.md` or `site/` from the package.

To change wireweave, work in the `AnEntrypoint/wireweave` repo and publish it; zellous picks the new
build up on the next page load. **Accepted tradeoff, identical to the kit's:** a wireweave publish
can change zellous's behavior with no commit in zellous, and boot depends on `unpkg.com` being
reachable. If that ever needs to stop floating, pin the importmap entry to an exact version — the
`@latest` choice is deliberate and matches every other browser-delivered consumer.

## GUI ownership: the SDK owns the whole app (`mountCommunityApp`)

The entire chat/community GUI lives in `anentrypoint-design`. `src/community-app.js`
exports `mountCommunityApp(root, adapter)` — it composes every surface (topbar, server+channel
rail, chat body, member list, voice view with grid/controls/ptt/vad/webcam, user panel, and all
overlays: context-menu, emoji-picker, command-palette, auth-modal, boot-overlay, settings-popover,
voice-settings-modal, video-lightbox, audio-queue, thread-panel; channel-type bodies forum/page)
and wires them to an injected `adapter`. It is barrel-exported (`window.__sdk.C.mountCommunityApp`)
and styled by the `community-app.css` cssPart (`.ca-app`/`.ca-rail`/`.group`/`.rail-empty`/`.vx-view`
+ `--cat-*` tokens). A reference kit lives at `ui_kits/community-app/` (mock adapter, no backend).

**zellous is a thin consumer.** `docs/js/nostr-adapter.js` maps `window.stateSignals` (preact
signals) + the feature-module actions (chat/lk/serverManager/channelManager/moderation/auth/queue/ui)
to the adapter contract `{get()->snapshot, subscribe(cb), actions, helpers}` and calls
`mountCommunityApp(#app, adapter)`. `subscribe` registers a `window.__effect` over the ~20 reactive
signals so any change re-renders. The imperative overlay globals (`__contextMenu`/`__emojiPicker`/
`__commandPalette`) are re-exposed from the returned `app.api`. The legacy `.app` scaffold in
`index.html` was deleted (commit `b6038a6`) — no dead `display:none` markup remains. The 27 old
`docs/js/sdk-*.js` mount IIFEs (all but `sdk-command-palette.js`) are deleted; only
`sdk-command-palette.js` remains, still referenced in `index.html`'s `scripts[]`. To change the GUI, edit
`anentrypoint-design` (additively) and let gh-pages redeploy.

**Adapter contract** is documented at the top of `src/community-app.js`. To add a surface: compose it
in `mountCommunityApp` reading from the adapter, add any new adapter field, and the consumer maps it.

### Current mount surface: only `sdk-command-palette.js` remains

`mountCommunityApp` composes every other surface directly (see GUI ownership section above); the
other 27 legacy `docs/js/sdk-*.js` subtree-mount IIFE files no longer exist on disk. Recall
"zellous community-app migration mount table" for the historical host→component mapping if needed.

### Final cleanup deferred (high blast radius)

- Deleting `docs/css/zellous.css` entirely — must wait until ALL surfaces above are migrated
- Switching from subtree mounts to top-level `mount(#app)` — same prerequisite

Until then, `zellous.css` co-exists with SDK's `community.css` (the SDK's `cm-*` classes don't collide with zellous's class names).

If you find yourself editing anything under `docs/vendor/`, stop — that's a third-party drop, not first-party code. Protocol behavior changes belong in the `wireweave` sibling repo (`../wireweave`), consumed live over CDN, not vendored.

## Validation loop (run before declaring done)

Browser-facing changes must be witnessed live, not assumed. Minimum loop:

```js
// 1. Parse-check first-party JS
exec:nodejs
const {execSync}=require('child_process');
const fs=require('fs'),p=require('path');
function walk(d,a=[]){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name.startsWith('.')||e.name==='vendor')continue;const fp=p.join(d,e.name);e.isDirectory()?walk(fp,a):/\.(m?js)$/.test(e.name)&&a.push(fp);}return a;}
const fails=[];for(const f of [...walk('docs/js'),...walk('site'),'flatspace.config.mjs'].filter(fs.existsSync)){try{execSync(`node --check "${f}"`,{stdio:'pipe'});}catch(e){fails.push(f+': '+String(e.stderr).split('\n')[0]);}}
console.log(fails.length?fails:'parse OK');
```

```js
// 2. Boot a static server and HTTP-witness key paths
exec:nodejs
const http=require('http'),fs=require('fs'),p=require('path'),url=require('url');
const ROOT=p.resolve('docs');
http.createServer((q,s)=>{let f=p.normalize(p.join(ROOT,decodeURIComponent(url.parse(q.url).pathname)));if(!f.startsWith(ROOT))return s.writeHead(403).end();if(fs.existsSync(f)&&fs.statSync(f).isDirectory())f=p.join(f,'index.html');if(!fs.existsSync(f))return s.writeHead(404).end('404');s.writeHead(200).end(fs.readFileSync(f));}).listen(5173);
setInterval(()=>{},1<<30);
// run with run_in_background:true
```

```js
// 3. Browser witness — appReady + globals + zero errors
exec:browser
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>m.type()==='error'&&errors.push(m.text()));
await page.goto('http://127.0.0.1:5173/nostr-chat/',{waitUntil:'networkidle'});
await page.waitForFunction('window.appReady===true',{timeout:15000});
const surface=await page.evaluate(()=>({zellousKeys:Object.keys(window.__zellous||{}).length,lk:typeof window.lk,auth:typeof window.auth,ui:typeof window.ui}));
console.log('surface',surface,'errors',errors.filter(e=>!/fonts\.googleapis/.test(e)));
```

If `errors` is non-empty (after filtering external Google Fonts failures, which are expected when offline), fix at root cause before continuing — never proceed past a known-bad signal.

## CI workflow

`.github/workflows/ci.yml` operationalizes the validation loop on every push/PR
across two jobs. `validate`: (1) a `node --check` parse-gate over `docs/js` +
`site` + `flatspace.config.mjs` (skips `vendor/`), and (2) a static-serve smoke
that HTTP-witnesses `/nostr-chat/` returns 200 HTML with explicit MIME types
(`.js`/`.mjs` -> `text/javascript`). `browser-witness`: boots the same static
server and drives it with Playwright chromium (cached via `actions/cache` on
`~/.cache/ms-playwright`, keyed on `package-lock.json`), navigating to
`/nostr-chat/`, waiting for `window.appReady===true`, and failing on any
console error other than the expected Google Fonts failure — the exact
validation loop step 3 check. It runs with `continue-on-error: true` since it
depends on `anentrypoint.github.io` being reachable at run time and flake risk
is still unknown; its pass/fail still reports on the PR/commit, it just doesn't
block merge. Keep the `validate` job green before pushing; `browser-witness`
is advisory for now.

## Things that look broken but aren't

- **No `<script type="importmap">` in raw HTML.** It is *injected at runtime* by an early classic script. Static greps will miss it; the importmap is real.
- **`docs/js/state.js` imports `@preact/signals`.** This works because (a) `state.js` is loaded via `await import('../js/state.js')` from inside the bootstrap module script, and (b) by that time the importmap has been injected.
- **`site/theme.mjs` imports `anentrypoint-design`.** Resolved by flatspace at CI build time; not by the browser. Don't try to vendor it locally.
- **`dist/index.html` differs from `docs/index.html`.** Different surfaces. `docs/` is the live GH-Pages site; `dist/` is the flatspace build artifact.
- **Repo-insight banners may flag `server.js`, SQL, hardcoded creds, etc.** The summary indexer caches old project shape. The current repo has no server, no SQL, no embedded credentials. Verify against the actual tree before "fixing".
- **No `wireweave` under `docs/vendor/`.** It is an npm package resolved from unpkg by the injected importmap, not a vendored directory — a plain `git clone` is complete and boots with no submodule step. See "wireweave is an npm package loaded from unpkg `@latest`" above.

## Rules

- **No backend.** Don't introduce a Node server, an Express route, a database, or anything that needs a process running. Voice and chat go through public Nostr relays. Storage is `localStorage` plus relay-side events.
- **No new `window.X` outside the bridge.** Add a manager via wireweave, expose it through `wireweave-bridge.js`, mirror under `window.__zellous`. Don't sprinkle `window.foo = ...` in random modules.
- **No comments unless a future reader genuinely needs the *why*.** Don't narrate what the code already says.
- **No fallback / demo / mock modes.** If a probe needs real Nostr, run real Nostr.
- **CRLF awareness.** When string-replacing in HTML files via `exec:nodejs`, use `\r?\n` in regexes — Git on Windows stores some HTML with CRLF.
- **Importmap edits must update *the inline injector script*** in `docs/nostr-chat/index.html`, not a literal `<script type="importmap">` (there isn't one).

## Non-obvious technical caveats

**Generic file upload was dead in `files.js` while image/video upload already worked, until 2026-07-30** — `chat.sendImage()` (`wireweave-bridge.js`) already routes any file through `window.nostrMedia.sendMedia()`, backed by wireweave's `Media` class (`../wireweave/src/media.js`): a direct browser `fetch`/`PUT` to a public Blossom server (`blossom.nostr.build` et al., NIP-98-authenticated via a signed kind:24242 event, no backend of ours involved), which returns a URL that gets embedded as the content of a normal kind:42 channel message. `docs/js/files.js`'s separate `fileTransfer.upload()` predates this and only worked over a legacy `state.ws` websocket that is always null in Nostr mode — it toasted "not supported" and stopped for every non-image/video file. Fixed by routing `ui-actions.js`'s `handleFileSelect` (the real `#fileInput`-driven upload path) through `chat.sendImage()` for all file types — Blossom has no type restriction, only a 20MB size cap (enforced in `media.js`, surfaced as a toast on rejection) — and deleting the dead chunked/base64 upload code from `files.js`, which now only keeps the clipboard-paste and drag-drop handlers (both widened from image/video-only to any file, same `sendMedia` path).

**gm's `browser` verb chromium-sandbox bug (2026-07-24/25), fixed at the source** — the actual browser-launch code lives in `AnEntrypoint/agentplug`'s `crates/agentplug-host/src/browser.rs` (a compiled Rust binary, `~/.gm-tools/agentplug-runner` — not `~/.gm-tools/plugkit-wasm-wrapper.js`, a deprecated/unused JS file whose distinct error wording and `logEvent` calls never appeared in `.watcher.log`, confirming it wasn't the real code path). Root cause: `launch_chrome()` never passed `--no-sandbox` and redirected Chrome's stdout/stderr to `Stdio::null()`, so in any container without a working Chrome sandbox (this one included — confirmed via `ps aux` polling that no chromium process was ever spawned during a failing dispatch, then via a from-source rebuild that captured the previously-silenced log and found Chrome printing `No usable sandbox!` and exiting immediately) the `browser` verb failed with an opaque 30s CDP-timeout and zero diagnostic trace. Fixed upstream: `launch_chrome()` now captures Chrome's output to a real log file and auto-retries once with `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage` when the log shows a sandbox denial (commit `124fadf` on `agentplug` main, released as `AnEntrypoint/agentplug-bin` v0.1.0, submodule pointer bumped in `AnEntrypoint/gm` commit `415a0723`). If the `browser` verb ever silently CDP-times-out again: clone `AnEntrypoint/gm` (its `agentplug` submodule is the real source, `plugkit-wasm-wrapper.js` is not), reproduce with `cargo build --release -p agentplug-runner` + a direct `dispatch gm browser '...'` call, and check the now-real `browser-chrome-profile-<session>/chrome-launch.log` first — don't re-diagnose from scratch.

**gm's `browser` verb supports a `viewport=WxH\n` prefix for mobile/device-viewport testing (added 2026-07-25, `agentplug` commit `dd56a93`/`d275d1c`)** — stack it in the same body-prefix chain as `timeout=`/`url=` (order matters: `timeout=`, then `viewport=`, then `url=`, then the script body — a prefix out of order is left unstripped and corrupts the downstream script/URL parse into a `SyntaxError`). `viewport=375x667\n` applies a real CDP `Emulation.setDeviceMetricsOverride` (+ touch emulation) before navigation, so responsive-CSS breakpoints can be exercised directly (e.g. confirmed live against zellous: `.app-topbar nav` is `display:none` at 375×667 and `display:flex` at 1280×800, proving the `@media (max-width:480px)` mobile nav-hide fix genuinely engages). Optional `@scale` suffix sets `deviceScaleFactor` (`375x667@2`); optional trailing `!desktop` disables mobile/touch emulation for a custom-but-non-mobile viewport. The script body must `return` its value from inside the `(async()=>{...})()` wrapper — a bare trailing expression is discarded, not returned.

**Bans/timeouts were only ever enforced in voice, never in text chat, until 2026-07-30 (an earlier changelog entry claiming this was fixed on 2026-07-24 was never actually true — `chat.js` had zero `bans` param until this date; corrected here rather than left stale)** — `voice.js` checked `bans.isBanned()`/`isTimedOut()` before letting a peer join a voice channel, but `chat.js` had zero awareness of the bans store at all: a banned user could still send text messages freely, and messages from a banned/timed-out author were never filtered out of other users' views either. Fixed by threading `bans` (and a new personal `mutes` — see below) into `createChat()` (`wireweave.js`) and adding enforcement points in `chat.js`: `send()` now rejects (emitting `send-blocked`) when the sender is banned/timed-out in the current server, and both the history-load and live-message subscriptions filter out events from banned/timed-out/personally-muted authors before they reach the message list — defense in depth against a bypassing client, not just a client-side send guard. Real-execution-witnessed via `test.js`'s `testChatBansAndMutesEnforcement`, not asserted from memory.

**Personal mute list (NIP-51 kind:10000), added 2026-07-30** — `wireweave/src/mutes.js`'s `Mutes` class lets each user publish/read their own private mute list (a replaceable event, `{kind:10000, tags:[['p',pubkey],...]}`), independent of server-level admin bans. `chat.js` filters a personally-muted author's messages out of the *viewer's own* local view only — it has no server-wide effect, unlike an admin ban. `wireweave.js` constructs one `Mutes` instance per session and calls `.load()` at boot; if `auth.pubkey` isn't populated yet (storage-restored login can resolve asynchronously), `load()` defers via the auth object's own `'login'` event rather than silently never loading.

**Chat message deletion never propagated to other clients until 2026-07-24** — `chat.js`'s `deleteMessage()` correctly publishes a NIP-09 kind:5 deletion event and optimistically removes the message from the deleting user's own local view, but nothing anywhere subscribed to kind:5 events, so the message stayed visible forever for everyone else. Fixed by adding a `chat-deletions-<channelId>` subscription in `loadHistory()` (`_handleDeletion()`), gated on `event.pubkey === originalAuthor || isAdmin(serverId)` — the same authorization pattern already used correctly in `roles.js`/`bans.js`/`settings.js`/`pages.js`. A NIP-09 deletion event only tags the deleted message's own id (no channel reference), so the relay-side filter can't scope by channel; the channel/relevance check happens client-side by looking the tagged id up in the locally-cached message list.

Any reactive voice-state signal derived from wireweave CustomEvents must be seeded on `'connected'`, not only on later change events (`'participants'`) — a self-only join is the one case where those change events never fire. `docs/js/wireweave-bridge.js` seeds `state.voiceParticipants` in its `'connected'` handler for this reason; `docs/js/nostr-adapter.js`'s `voiceParticipants` mapping derives the SDK's `speaking`/`color` fields from wireweave's raw `isSpeaking`/no-color shape.

**Voice join required a working microphone; no mic meant no voice at all, not even to listen** — `wireweave`'s `src/voice.js`'s `connect()` awaited `getUserMedia()` unguarded and threw on any device/permission failure, even though every downstream use of `localStream` (mute toggle, recording, peer transceivers) already null-guards it and falls back to a `recvonly` transceiver. Fixed: `getUserMedia` failure is now caught, `localStream` stays `null`, and a `media-warning` event (wired to a toast in `wireweave-bridge.js`) tells the user they joined listen-only instead of the join silently failing. This was the real cause of "voice used to work, now it's broken" — not an SDK/adapter wiring gap, a hard media dependency with no fallback.

When wiring any adapter boolean the SDK's own render logic branches on (e.g. `mobileMenuOpen`, `memberListOpen`), verify the exact field name against the live `247420.js` bundle (`curl` + grep) rather than assuming a same-named zellous action drives the right signal — it's easy to have an action that only touches dead legacy DOM while the real signal stays unwired.

**SDK AppShell `.app` flex-direction collision** — anentrypoint-design's AppShell renders `<div class="app">` with `flex-direction: column`. Zellous nostr-chat's `discord.css` also uses `.app` with `flex-direction: row` for the chat layout. When `installStyles()` runs, the SDK's inline stylesheet overrides discord.css. Without the override, the chat renders as a column. Fix: `docs/css/sdk-shell.css` declares `html.ds-247420 .app { display:flex !important; flex-direction:row !important }` with mobile `@media` override to `column`.

**CSS specificity + min-width inheritance** — `chat-surface.css` uses `.server-list` and `#serverList` (id selectors), which beat `html.ds-247420 .server-list`. When collapsing the server list via `width:0`, the list doesn't shrink because `discord.css` pins `.server-list { min-width: var(--server-list-width) }`. Fix: on collapsed state, include `#serverList` selector AND `min-width: 0 !important` to override the inherited min-width from discord.css and allow true collapse.

**Windows static dev server path traversal** — When implementing path traversal checks for a dev server on Windows, use `path.resolve(ROOT)` + `path.resolve(path.join(ROOT, p))` for normalization. Raw `startsWith()` on forward-slash ROOT vs backslash-joined paths fails because backslashes don't normalize correctly for string comparison.

**Playwriter (exec:browser) viewport API** — playwriter uses Playwright's `page.setViewportSize({width, height})`, NOT puppeteer's `page.setViewport()`. The method name and parameter structure differ. Ensure viewport manipulation code targets Playwright, not puppeteer.

**AppShell `.app-body` grid-to-flex override** — anentrypoint-design's AppShell `.app-body` renders as `display: grid`. Overriding to flex requires both `display:flex !important` AND `grid-template-columns:none !important` to clear grid tracks. Setting display:flex alone loses the cascade against the grid definition.

**AppShell `.app-main` padding cascade** — anentrypoint-design's `.app-main` ships with `padding: 16px 20px 72px`. Unprefixed `padding:0` from wrapper stylesheets loses the cascade. Override requires `!important` flag.

**AppShell `.app-body.no-side` element retention** — When `.app-body.no-side` is set, the SDK still renders the `.app-side-shell` element off-screen via fadeOutLeft animation. It still consumes a grid track or flex item. To reclaim the space, explicitly hide it: `.app-body.no-side > .app-side-shell { display:none }`.

**Viewport height overflow from iframe min-height clamp** — site/theme.mjs embedClient: using iframe `height: calc(100vh - 180px); min-height:520px` causes body overflow on standard desktop sizes (e.g., bodyH 970px > viewport 900px). Fix: lock html/body/#app/.app/.app-body/.app-main to flex column with `height:100vh; overflow:hidden`, iframe `height:100%`, and remove the min-height clamp.

**Flatspace build command and output** — Flatspace is invoked via `npx --yes flatspace@latest build` (see .github/workflows/gh-pages.yml). There is no local build script in package.json; the command must be run directly. Build output goes to ./dist.

**There is no local SDK copy anywhere in zellous — both surfaces load unpkg `@latest`** — `docs/sdk/` does not exist, and the last stale vendored kit CSS (`docs/vendor/design/{colors_and_type,app-shell}.css`) has been removed. It was tracked in git and linked ONLY by the marketing landing (`docs/index.html`), so the landing rendered a frozen old kit while `docs/nostr-chat/` rendered live `@latest` — two different kit versions in one repo, with the doc claiming no local copy existed. Both surfaces now link the single bundled `https://unpkg.com/anentrypoint-design@latest/dist/247420.css`. Do not reintroduce a vendored kit copy: if a surface needs kit CSS, link that same bundled `@latest` URL.

**wireweave consumed LIVE from npm via unpkg `@latest` (supersedes both the vendored approach and any pinned CDN specifier)** — the inline importmap injector in `docs/nostr-chat/index.html` maps `wireweave` → `https://unpkg.com/wireweave@latest/src/index.js`; `wireweave-bridge.js` does `await import('wireweave')` and uses `mod.createWireweave(...)`. The vendored `docs/vendor/wireweave/src/` copy remains **deleted** — re-vendoring is rejected (it drifted stale under the old copy-by-hand model and would drift again). Deliberately unpinned, not a caret or exact-version pin: to propagate a wireweave change, commit + push `AnEntrypoint/wireweave` (sibling repo), which publishes to npm; unpkg's `@latest` resolves the new version immediately and zellous picks it up on next load — no importmap edit, no re-vendor step. **Tradeoff:** zellous boot depends on `unpkg.com` being reachable, and any published regression ships immediately with no staging step; `wireweave-bridge.js` has a clear boot-error message on import failure (no try/catch fallback — wireweave failing to load means the app has no protocol layer at all, so there is no degraded mode to fall back to).

**SDK JS+CSS consumed LIVE from unpkg @latest (supersedes the gh-pages approach)** — the inline importmap injector in `docs/nostr-chat/index.html` maps `anentrypoint-design` → `https://unpkg.com/anentrypoint-design@latest/dist/247420.js`, and the single stylesheet `<link>` points at `https://unpkg.com/anentrypoint-design@latest/dist/247420.css` (bundled: colors_and_type + app-shell + community + editor-primitives, all scoped under `.ds-247420`, matched by `<html class="ds-247420">`). zellous carries no local SDK copy and auto-tracks the SDK's npm-published `@latest` build via unpkg. To propagate an SDK change: `node scripts/build.mjs` in the `anentrypoint-design` repo, commit + push (triggers `npm publish`); unpkg picks up the new version on next resolve and zellous picks it up on next load. **Tradeoff:** zellous boot now depends on `unpkg.com` being reachable; the SDK import is wrapped in try/catch and sets `window.__sdk = null` on failure (graceful-degrade, no hard crash). Note: only the bundled `247420.css` is linked — do not link individual cssPart names (`community.css`/`editor-primitives.css`) from unpkg, they are not published as separate top-level dist files.

**The `anentrypoint-design` entry in `package.json` is `latest`, and is NOT what the browser loads** — zellous has no build step for `docs/`, so the npm dependency exists only for `site/theme.mjs`, which flatspace resolves at CI build time for the marketing build. The browser always resolves the kit through the unpkg `@latest` importmap entry. Keep the dep at `latest` (never a caret range: on the kit's `0.0.x` line `^0.0.391` is a hard pin that floats nothing) so the two paths cannot drift apart. `package-lock.json` is a stale artifact of this repo's no-build shape and does not gate what renders.

### Kit consumption strategy (fleet-wide)

One strategy across every consumer of `anentrypoint-design`: **Node-resolved consumers** (freddie, casey) declare the npm dependency as `latest`, never a caret/tilde range; **browser-delivered consumers** (zellous, spoint, thebird) load `https://unpkg.com/anentrypoint-design@latest/dist/247420.{js,css}` pinned at `@latest` everywhere, with no stale vendored copy served alongside.

Two consumers are deliberately excluded and must stay excluded: **gmsniff** (vendors a kit subset, makes zero external-origin runtime fetches, because it must run air-gapped and must never become a supply-chain surface for the agent host it observes) and **agentgui** (vendors the built kit locally for offline operation and a UI that does not shift when upstream publishes). Neither is drift; do not convert either to a CDN load or a runtime dependency.

Accepted tradeoff of `@latest`: a kit publish can change zellous's UI with no commit in zellous. That is the intended behavior here — the two repos for which it is unacceptable are the two exclusions above.

**SDK CSS cssParts must be `<link>`ed in index.html or component styles silently don't apply** — the SDK splits styling across `colors_and_type.css`, `app-shell.css`, `community.css` (community surface `.cm-*` + voice `.vx-*`), and `editor-primitives.css` (overlay `.ov-*`). zellous originally linked only colors + app-shell, so `.cm-*`/`.vx-*`/`.ov-*` component classes rendered unstyled. All four vendored cssParts are now linked. When adding a component whose CSS lives in a not-yet-linked cssPart, add the `<link>`.

**SDK component reaches consumers as `C.X` only via the barrel** — `src/components.js` does `import * as components` and a consumer reads `sdk.C.X`. A new `export function Foo` in a component file is invisible until re-exported from `src/components.js`. The zellous `docs/js/sdk-*.js` mounts poll `setTimeout(init,30)` forever on `!sdk.C.Foo`, so a missing barrel re-export = a silently dead feature (no error), not a crash.

**Static dev server must set MIME types** — When serving `docs/` locally for module script testing, the dev server must send explicit `Content-Type` headers (e.g. `text/javascript` for `.js` files). Browsers enforce strict MIME checking for ES modules and will refuse to execute scripts served without the correct type, even if the file content is correct.

**CSS specificity / override history** — the old per-stylesheet ID-selector `!important` hacks (chat-surface.css/sdk-shell.css beating SDK class `!important`) are gone; zellous.css is token-only and delegates layout to SDK app-shell.css. Detail in rs-learn (`recall` "zellous CSS history quirks").

**Design tokens as CSS variables** — After 2026-05-01 CSS rebuild, zellous.css uses only design tokens (--bg, --fg, --accent, --green, etc.) sourced from tokens.css and 247420.css. All legacy layout-specific stylesheets (discord.css, chat-surface.css, sdk-shell.css, flow.css, ripple.css, animations.css) were deleted and unified into zellous.css. This eliminates specificity conflicts but requires strict adherence to token-only styling; no hardcoded colors or layout hacks.

**dev server MIME type: .mjs requires text/javascript** — Port 5173 in the static server validation loop (step 2) serves .mjs files without explicit Content-Type header, causing browser module load failures. When testing locally, use a port that sends `text/javascript` for .mjs (e.g., port 5175), or patch the validation server code to explicitly set `s.writeHead(200, {'Content-Type':'text/javascript'}).end(...)` for .mjs files.

## Quick path map

```
docs/
  index.html                         marketing landing (live)
  nostr-chat/index.html              the app (live)
  js/                                first-party UI + bridge + state
    wireweave-bridge.js              ←  exposes all window globals
    state.js                         ←  ESM, signals, window.state/config
    ui*.js                           ←  render
    *.js                             ←  feature modules (audio, files, ptt, …)
  vendor/
    {preact,xstate,nostr-tools,…}    third-party
                                     (wireweave is NOT here -- unpkg @latest)
  css/
  msgpackr.min.js                    binary codec
site/                                flatspace inputs (theme + content)
flatspace.config.mjs                 build config (CI only)
dist/                                CI build artifact
scripts/fetch-vendor.js              vendored-dep fetcher
```

**Legacy overlays/inputs with no `position` rule inflate `document.body.scrollHeight`** — post-SDK-migration, several legacy DOM elements survive in `nostr-chat/index.html` still wired to legacy controllers (`#videoPlayback` toggled by webcam.js, `#settingsPopover` toggled by ui-actions.toggleSettings, `#fileInput.hidden-input`). They carried NO CSS `position`/`display` rule, so they defaulted to `position:static; display:block` and sat in normal flow *below* the SDK AppShell, inflating `document.body.scrollHeight` (witnessed 1358 vs 900 viewport). Because `html,body { overflow:hidden }` is set, this produced no visible scrollbar — a silent latent bug. Fix (commit fdd4d28): `zellous.css` now positions `.video-playback` + `.settings-popover` as `position:fixed; display:none` overlays (z-index 2600) and `.hidden-input` as the canonical visually-hidden 1px clip. When you add any always-present overlay/trigger element to index.html, give it a `position:fixed`/`absolute` + hidden-by-default rule or it will inflate body height. Verify with `document.body.scrollHeight <= window.innerHeight` in a browser witness.

**GUI surface validation, SDK icon set, context-menu contract, chat chrome layout, and no-mock-data enforcement** — all historical details (pre-`mountCommunityApp`-migration mount names like `sdk-rooms.js`/`sdk-context-menu.js`/`sdk-channel-sidebar.js`/`sdk-user-panel.js` no longer exist on disk) compressed; recall "zellous GUI surface validation and icon/context-menu/chrome history" for detail if needed.

**Channel/server right-click context menus (Rename, Delete, Channel Settings, Copy Invite Link, Edit/Leave/Delete Server) render real DOM but need `.open` on `_mkMenu`'s element** — `docs/js/nostr-channels-ui.js`'s shared `_mkMenu(id, x, y, html, onAction)` (used by both channel and server context menus) creates `<div class="context-menu">` without the `.open` class `zellous.css` requires for `display:block`, so right-click management was invisible with zero console signal. Fixed by setting `className = 'context-menu open'`. Any new legacy DOM overlay in this codebase should be checked against its CSS's default-hidden state the same way.

**The rail (`mountCommunityApp`'s own `railView`, not the separate unused `ChannelSidebar` export) has no per-category grouping or create-channel affordance by default** — `anentrypoint-design`'s real rendering path groups channels into flat "rooms"/"voice"/"servers" sections, not the per-category headers `C.ChannelSidebar` renders (which zellous does not mount). A "+" button was added next to "rooms" in `community-app.js`, gated on `adapter.get().canManage` and `adapter.actions.createChannel()`; zellous wires `createChannel` to the existing (previously unreachable) `channelManager.showCreateModal`.

**Voice Settings modal (mode/device/RNNoise/AutoGain/ForceTURN/bitrate/volume) was entirely dead** — `adapter.actions.openVoiceSettings` called `window.openVoiceSettings`, a function that was never defined anywhere in the codebase, so the real, reachable "Voice settings" gear button (rendered by the SDK's `VoiceControls`) silently no-oped. All backing signals (`rnnoiseEnabled`/`autoGainEnabled`/`forceTurnEnabled`/`voiceBitrate`/`inputDeviceId`/etc.) already existed in `state.js` — this was a pure adapter-wiring gap. Fixed by implementing `openVoiceSettings`/`voiceSettingsChange`/`voiceSettingsSave`/`voiceSettingsClose` in `nostr-adapter.js`, adding device enumeration, and threading the chosen input device + processing constraints into `voice.js`'s `connect()` via a new `setAudioConstraints()` method (applies on next join/rejoin — no live peer-connection renegotiation attempted, matching the standard "settings apply on reconnect" UX pattern).

**Pages (kind 30078, full CRUD in `pages.js`) were fully implemented at the protocol level but completely unreachable through the UI** — page channels are synthesized entirely from published Pages events via `adapter.get()`'s `pageChannels()`, not the regular channel-create flow, and there was no "create a page" trigger anywhere. Added "Create Page" to the server context menu (owner-gated) and replaced `editPage`'s crude `window.prompt()` with a proper `showEditPageModal` (title + HTML textarea, matching the app's existing modal patterns).

**Forum posts (kind:11 thread roots + NIP-22 kind:1111 replies, `wireweave/src/forum.js`), implemented 2026-07-30** — closes the last remaining documented gap; `newForumPost` no longer toasts "not yet supported". Posts are scoped to a channel via the same hashed-channel-tag discipline `chat.js` already uses for kind:42 messages; replyCount is derived client-side from however many kind:1111 events tag a post as root (same aggregation pattern as `reactions.js`). Consumer-side: `window.nostrForum` bridge, `forumPosts` adapter field, `switchChannel` calls `loadChannel` when entering a forum-type channel, `newForumPost` opens a real modal (`channelManager.showNewForumPostModal`, matching the page/channel modal pattern). The SDK's `ForumView` reuses the same `openThread`/`onSelect` action name `ThreadPanel` uses for its own threaded-channel concept — `threadManager.select()` branches on `state.currentChannel.type === 'forum'` to route to `selectForumPost()` instead of the threaded-channel `switchChannel` path, since a forum post id is never a real channel id.

**`docs/js/ui-chat.js` was fully dead code, deleted.** Message reactions (NIP-25, kind:7) are now fully built: `wireweave/src/reactions.js`'s `Reactions` class subscribes `{kinds:[7],"#e":[...]}` and aggregates client-side keyed by last `e` tag with last-write-wins per pubkey+target, `docs/js/wireweave-bridge.js` exposes `window.nostrReactions` (`getFor`/`react`/`unreact`), and `docs/js/nostr-adapter.js` maps `getFor(m.id)` into each message's `reactions` field for the SDK's `.rxn` span. Live-witnessed working (`window.nostrReactions.react`/`getFor` both functions, zero console errors) — this AGENTS.md note previously described a gap that had already been closed in an intervening session; corrected here rather than left stale.

**Generic file uploads route through the existing Blossom path (2026-07-30), not a separate mechanism.** `../wireweave/src/media.js`'s `Media` class already implements a complete backend-free upload via Blossom (direct browser `fetch`/`PUT` to public blob hosts, NIP-98-style signed auth, 20MB cap) — it was only ever wired to `chat.sendImage()` for image/video. `docs/js/ui-actions.js`'s `handleFileSelect` and `docs/js/files.js`'s paste/drag-drop handlers now route every file type through the same path; the old 50MB chunked/base64 dead implementation gated on `state.ws` (always null in Nostr mode) is deleted.

**Member list was permanently non-functional until 2026-07-30** — `nostr-adapter.js` computed `memberCategories` via `window.uiMembers.categories && window.uiMembers.categories()`, but `docs/js/ui-voice.js`'s `uiMembers` only ever defined `render()` (a legacy method targeting removed DOM), never `categories()` — so the guard always short-circuited to `[]` and the SDK's `MemberList` showed its empty state regardless of real online members. Fixed by adding `uiMembers.categories()`, building the `[{label, members:[...]}]` shape `MemberList` expects from the same role-grouping logic `render()` already had.

**Untrusted Nostr event fields (server name/color tags) were concatenated raw into `innerHTML` — fixed 2026-07-30.** `docs/js/nostr-servers-ui.js`'s join-preview modal, edit-server-name input, and server-icon list all inserted attacker-controlled kind:34550 `name`/`color` tag values (`../wireweave/src/servers.js`) into `innerHTML`/`style` with no or partial escaping — any user able to create/rename a server could inject markup or break out of a `style` attribute into any other viewer's client. Fixed by routing every server-name/color/initial value through the existing `escHtml()` helper, matching how channel/member names are already handled. Pages HTML (kind 30078) and chat messages were independently confirmed already safe (DOMPurify-backed `sanitizeHtml()` in the SDK, and text-node-only rendering, respectively) — this was the one real gap.

**`wireweave-bridge.js`'s `import('wireweave')` has a clear boot-error message on failure (2026-07-30)**, matching the SDK import's existing `window.__boot.fail(...)` pattern — still rethrows immediately after (no fallback/degraded mode, per this file's "no fallback" rule), so boot still halts on a wireweave load failure; the change is user-visible feedback only, not new resilience logic.

**Overlay open-focus race (SettingsPopover/EmojiPicker/Popover/ContextMenu/Drawer/Dialog/VideoLightbox, `anentrypoint-design`)** — six call sites used `queueMicrotask(() => el.focus())` to move focus into a newly-opened overlay, which runs in the SAME tick as the triggering click's own default focus-on-click. That race could leave focus on the trigger element instead of the overlay, silently breaking Escape-to-close/Tab-trap for keyboard users (keydown only bubbles from whatever element actually has focus) — live-witnessed on zellous's SettingsPopover: Escape did nothing until the popover was focused manually. Fixed by switching all six to `setTimeout(fn, 0)`, which reliably runs after the click's own focus settles.

**Disk-full destabilizes the `browser` verb's chromium (2026-05-28 incident)** — when `C:` hit 100% (≈13M free on a 1.9T disk), a `Write`/`Edit` truncated a file to 0 bytes (ENOSPC mid-write — restore from git and retry once space is freed) AND the playwriter chromium began crashing with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` on any long-busy operation (`goto`+`waitForFunction`). Recovery: (1) `git checkout -- <file>` to restore truncated files; (2) close the browser session, `Stop-Process` the orphaned `ms-playwright` chrome.exe procs (filter CommandLine `*ms-playwright*` — do NOT kill the user's personal Chrome), `rm -rf .gm/browser-profile` (gitignored, recreatable) to reclaim space; (3) spawn a fresh `session new`. A short `waitForTimeout`-based witness body succeeds where a long `waitForFunction` body crashes the destabilized chromium — prefer the former under disk pressure.

## Learning audit

2026-04-30 through 2026-05-01 (4 sessions): recall/codesearch sampling on importmap/preact/wireweave/CRLF/path-traversal/appshell/playwriter facts, consistently 0/5 recall hit rate against an empty rs-learn store; ~15 facts gradually ingested and several AGENTS.md caveats added (docs/sdk/ gitignore split, static-server MIME types, sdk-shell.css specificity, design-tokens unification) across the run.
2026-07-26: gm-plugkit spool watcher was stale/non-responsive for the memorize-fire step this session (heartbeat ts never advanced after reboot) -- facts landed in AGENTS.md only, not rs-learn; re-fire on a future session when the watcher is healthy. Compressed the 28-entry historical sdk-*.js mount table (only sdk-command-palette.js still exists on disk; mountCommunityApp composes everything else) into a one-line pointer. Found and fixed 2 real live-witnessed defects: voice-join hard-required a mic with no listen-only fallback, and the mobile hamburger/member-list toggles drove dead legacy DOM instead of the mobileMenuOpen/memberListOpen signals the SDK bundle actually reads.
2026-07-28: gm-plugkit spool remained unreliable this session (stale/frozen heartbeat repeatedly, PRD ids resolved didn't match requested ids, memorize-fire dispatches never landed a response) -- did the actual audit work via agent-browser + direct git/gh CLI instead of the spool's browser/git verbs, and tracked progress with TaskCreate/TaskUpdate. Compressed 5 more stale AGENTS.md entries referencing pre-migration `sdk-*.js` mount names (rooms/context-menu/channel-sidebar/user-panel/thread-panel/forum-view) that no longer exist on disk. Found and fixed 5 real live-witnessed defects spanning both this repo and the `anentrypoint-design` SDK repo: (1) channel/server context menus rendered invisible (missing `.open` class), (2) no way to create a channel through the live UI at all (SDK rail had no per-category affordance), (3) Voice Settings modal was entirely dead (`window.openVoiceSettings` never defined), (4) six SDK overlay types had a focus-race on open breaking Escape/Tab-trap for keyboard users, (5) Pages (fully built at the protocol level) were unreachable through the UI with no create-page trigger. Also deleted a confirmed-fully-dead legacy module (`ui-chat.js`) and fixed a hidden-file-input tab-order trap.
2026-07-30 (session A): gm-plugkit watcher went genuinely stuck mid-session, recovered via kill+reboot. codesearch remained down (`plugin gm not loaded`); fell back to direct Read/Grep. 6-agent parallel audit found/fixed 9 defects (file-upload toast, roles.js authz gap allowing admin-demotes-admin/owner, channel/server name validation gaps, `#drawerOverlay` scrollHeight-inflation bug, dark-theme contrast regression, 4 more overlay focus-race instances, dead `ptt.js`, architecturally-broken VAD auto-transmit). Root-caused wireweave vendor drift at the source: switched to live `esm.sh` CDN consumption (same pattern as the SDK), eliminating the drift class entirely.
2026-07-30 (session B, 20-agent ultracode fan-out): 10 parallel research agents (NIP-25/NIP-17/NIP-07/NIP-7D specs, WebRTC/RNNoise successors, active GitHub repos, esm.sh pinning patterns, CSP/SRI hardening, Playwright CI patterns, chat a11y guidance) + 10 parallel implementation agents produced 6 real commits: advisory Playwright CI browser-witness job with chromium caching; caret-pinned the wireweave CDN import (`@^0.3.51`) to narrow blast radius on breaking majors while keeping patch/minor auto-tracking; a clear boot-error message on wireweave import failure; generic file uploads now route through the existing (previously image/video-only) Blossom path, deleting a dead 50MB chunked-upload implementation; a real bug fix making the member list functional (`uiMembers.categories()` was never implemented, so it silently always rendered empty); and an XSS fix escaping attacker-controlled server name/color Nostr tags before `innerHTML` insertion, bundled with a keyboard-accessibility pass (focus-visible styles, keyboard activation on channel/server rail items, Escape-to-close on overlays). One investigation-only finding: the CSS/`.app`-scaffold final-cleanup is still genuinely blocked (multiple live modules still query its DOM IDs unconditionally) — not attempted. Concurrent-session PRD contention observed and handled per single-writer discipline (a much larger inherited backlog was resolved by a parallel session while this one's 10 rows were tracked independently).
2026-08-06: fresh SPECIFY pass over a project already carrying 104 completed rows from prior sessions found all of them genuinely closed (no stale/false-completion rows) — the residual usability work was the last 3 documented `blockedBy:external` SDK gaps, all closed this session in the sibling repos: (1) `anentrypoint-design` avatar text now computes real contrast (black/white via WCAG relative luminance) against each user's hashed `--avatar-bg` instead of one fixed `--fg-2` token, fixing measured sub-4.5:1 cases; (2) `PageView` gained `author`/`updatedAt` props (`wireweave/src/pages.js` now stores `event.pubkey` as `page.author`, threaded through `nostr-adapter.js` and rendered in `.cm-page-meta`); (3) `EmojiPicker` gained a real `.ov-emoji-search` input wired to its own previously-unfed `query` filter — live-witnessed filtering "smile" down to exactly 5 emoji. Also fixed 2 unrelated pre-existing lint-gate failures encountered rebuilding `anentrypoint-design` (a raw `z-index:-1` repointed to the existing `--z-below` token; an intentional brand-color literal allow-listed). Investigated the `sdk-threadpanel-nesting` row and found the "3+ levels of nesting" acceptance criterion from a prior audit was itself wrong: `wireweave/src/forum.js`'s NIP-22 replies are architecturally flat by design (every reply tags the root post only, never another reply), so `ThreadPanel`'s flat-list rendering was already correct — closed as investigated-and-confirmed-non-issue, not a code change. A full live regression sweep (boot, 375/768/1280 viewports, theme toggle, forum post creation) found zero regressions from the 5 commits since the last full audit. Heavy concurrent-session write contention on `design`/`zellous` this session (multiple pushes to `origin/main`/`origin/master` landed mid-session from other sessions) — handled via fetch+diff-disjointness-check+reapply rather than blind force-push each time; one `prd-resolve` response reported the wrong id once under contention but the correct row was independently confirmed to have landed correctly by reading `.gm/prd.yml` directly, and a second row's resolve silently failed to persist once and needed a same-session retry — do not trust a `prd-resolve` success response alone under concurrent load without spot-checking the file.

@.gm/next-step.md
