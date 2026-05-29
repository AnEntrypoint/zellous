# AGENTS.md — Operating Guide for Coding Agents

This file is for agents (Claude Code, etc.) working in this repo. For the architecture reference, read `CLAUDE.md` first; this file only adds operational discipline.

## Repo shape (one-liner)

Static GH-Pages app under `docs/`. Real protocol logic in `docs/vendor/wireweave/src/`. Window globals are wired in `docs/js/wireweave-bridge.js`. No backend, no build for the app itself; `flatspace.config.mjs` + `site/` only build the marketing landing into `dist/`.

## What you almost certainly want to edit

| Goal | Edit here |
|---|---|
| Change UI render / layout for an SDK-mounted surface | `docs/js/sdk-*.js` (subtree mounts of `anentrypoint-design` components) |
| Change UI render / layout for a not-yet-migrated surface | `docs/js/ui*.js`, `docs/css/zellous.css`, `docs/nostr-chat/index.html` |
| Change protocol behavior (Nostr events, voice signaling, etc.) | `docs/vendor/wireweave/src/*.js` |
| Expose / rename a window global | `docs/js/wireweave-bridge.js` (mirror under `window.__zellous`) |
| Add a vendored dep | `scripts/fetch-vendor.js`, then add an importmap entry inside the inline injector script in `docs/nostr-chat/index.html` |
| Touch state | `docs/js/state.js` (single source of truth for signals) |
| Improve an SDK component (or add a missing one) | edit `C:\dev\anentrypoint-design\src\components\*.js` + the relevant cssPart (`community.css`/`editor-primitives.css`/`app-shell.css`), re-export from `src/components.js` (barrel re-export is what makes it `C.X`), run `node scripts/build.mjs`, then **commit + push the SDK repo**. Its GitHub Pages deploy (`https://anentrypoint.github.io/design/247420.js` + `247420.css`) is what zellous consumes live — there is **no re-vendor step in zellous anymore** (see SDK-load note below). npm publish is still blocked (no auth); gh-pages is the propagation path. |
| Marketing landing | `docs/index.html` (live) and/or `site/` + `flatspace.config.mjs` (CI-built `dist/`) |

## SDK migration status (2026-05-27)

The community-surface migration to `anentrypoint-design` is **complete** — all visible chrome runs through SDK subtree mounts. There are 26 `sdk-*.js` mounts, every one loaded in the `scripts` array of `docs/nostr-chat/index.html`. Each SDK subtree mount lives in its own `docs/js/sdk-*.js` IIFE:

| Surface | Host element | Mount module | SDK component |
|---|---|---|---|
| Server rail | `#serverList` | `sdk-server-rail.js` | `C.ServerRail` |
| Server + channel rail | `#zRoomList` | `sdk-rooms.js` | bespoke `pill()` using `C.Icon` (NOT `C.ChannelSidebar`) |
| User panel (self identity) | `#userPanelSlot` | `sdk-user-panel.js` | `C.UserPanel` |
| Legacy channel sidebar | `#channelSidebar` | `sdk-channel-sidebar.js` | neuter stub only (hides legacy, no SDK mount) |
| Chat header | `#chatHeaderBar` | `sdk-chat.js` | `C.ChatHeader` |
| Chat body + composer | `#chatArea` | `sdk-chat.js` | `C.Chat` |
| Member list | `#memberList` | `sdk-member-list.js` | `C.MemberList` |
| Voice strip (above user panel) | `#voiceStripSlot` | `sdk-voice-strip.js` | `C.VoiceStrip` |
| Voice grid tiles | `#voiceGrid` | `sdk-voice-grid.js` | `C.VoiceUser` |
| Voice controls bar | `#voiceControlsBar` | `sdk-voice-controls.js` | `C.VoiceControls` |
| Video lightbox | `#videoLightboxHost` (body-appended) | `sdk-video-lightbox.js` | `C.VideoLightbox` |
| Thread panel | `#threadPanel` | `sdk-thread-panel.js` | `C.ThreadPanel` |
| Forum view | adjacent to `#forumView` | `sdk-forum-view.js` | `C.ForumView` |
| Page view | adjacent to `#pageView` | `sdk-page-view.js` | `C.PageView` |
| Auth modal | body-appended | `sdk-auth-modal.js` | `C.AuthModal` |

Pattern for each `sdk-*.js`: IIFE that waits for `window.__sdk` + `window.__effect` + relevant globals, clears its host, calls `applyDiff(host, view())` inside an `effect()` reading signals.

### Also migrated (additional `sdk-*.js` mounts, all loaded in index.html)

These were formerly listed as "not yet migrated"; they each now have a loaded consumer module:

| Surface | Mount module | SDK component |
|---|---|---|
| Settings popover | `sdk-settings-popover.js` | `C.SettingsPopover` |
| Voice settings modal | `sdk-voice-settings-modal.js` | `C.VoiceSettingsModal` |
| Boot overlay | `sdk-boot-overlay.js` | `C.BootOverlay` |
| Mobile header / drawer | `sdk-mobile-header.js` | `C.MobileHeader` |
| Toast | `sdk-toast.js` | `C.Toast` |
| Context menus | `sdk-context-menu.js` | `C.ContextMenu` |
| Emoji picker | `sdk-emoji-picker.js` | `C.EmojiPicker` |
| Reply bar | `sdk-reply-bar.js` | `C.ReplyBar` |
| Command palette (Cmd+K) | `sdk-command-palette.js` | `C.CommandPalette` |
| Audio queue UI | `sdk-audio-queue.js` | `C.AudioQueue` |
| PTT button | `sdk-ptt-button.js` | `C.PttButton` |
| VAD meter | `sdk-vad-meter.js` | `C.VadMeter` |
| Webcam preview | `sdk-webcam-preview.js` | `C.WebcamPreview` |
| Connection/voice banners | `sdk-banners.js` | `C.Banner` |
| Auth modal | `sdk-auth-modal.js` | `C.AuthModal` |

### 2026-05-27 fix: 6 mounts were silently dead (SDK gap, now closed)

`sdk-auth-modal.js`, `sdk-forum-view.js`, `sdk-page-view.js`, `sdk-thread-panel.js`, `sdk-video-lightbox.js`, and `sdk-voice-controls.js` referenced `C.AuthModal` / `C.ForumView` / `C.PageView` / `C.ThreadPanel` / `C.VideoLightbox` / `C.VoiceControls`, but **none of those six components existed** in `anentrypoint-design` (absent from the barrel, `src/components/`, and the built dist). Each mount polls `setTimeout(init, 30)` forever on a missing `C.X`, so the feature was dead with no error. They are now implemented (`VoiceControls` in `voice.js`; `AuthModal`/`VideoLightbox` in `overlay-primitives.js`; `ThreadPanel`/`ForumView`/`PageView` in `community.js`), re-exported from the barrel, with CSS in the `community.css`/`editor-primitives.css` cssParts, built, and re-vendored into `docs/sdk/` + `docs/css/vendor/`. Browser-witnessed live: all six are now `typeof function`, AuthModal/VideoLightbox/VoiceControls render expected DOM, zero console errors.

### Final cleanup deferred (high blast radius)

- Deleting `docs/css/zellous.css` entirely — must wait until ALL surfaces above are migrated
- Switching from subtree mounts to top-level `mount(#app)` — same prerequisite

Until then, `zellous.css` co-exists with SDK's `community.css` (the SDK's `cm-*` classes don't collide with zellous's class names).

If you find yourself editing `docs/vendor/<thirdparty>/` other than `wireweave/`, stop — that's a third-party drop, not first-party code.

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

## Things that look broken but aren't

- **No `<script type="importmap">` in raw HTML.** It is *injected at runtime* by an early classic script. Static greps will miss it; the importmap is real.
- **`docs/js/state.js` imports `@preact/signals`.** This works because (a) `state.js` is loaded via `await import('../js/state.js')` from inside the bootstrap module script, and (b) by that time the importmap has been injected.
- **`site/theme.mjs` imports `anentrypoint-design`.** Resolved by flatspace at CI build time; not by the browser. Don't try to vendor it locally.
- **`dist/index.html` differs from `docs/index.html`.** Different surfaces. `docs/` is the live GH-Pages site; `dist/` is the flatspace build artifact.
- **Repo-insight banners may flag `server.js`, SQL, hardcoded creds, etc.** The summary indexer caches old project shape. The current repo has no server, no SQL, no embedded credentials. Verify against the actual tree before "fixing".

## Rules

- **No backend.** Don't introduce a Node server, an Express route, a database, or anything that needs a process running. Voice and chat go through public Nostr relays. Storage is `localStorage` plus relay-side events.
- **No new `window.X` outside the bridge.** Add a manager via wireweave, expose it through `wireweave-bridge.js`, mirror under `window.__zellous`. Don't sprinkle `window.foo = ...` in random modules.
- **No comments unless a future reader genuinely needs the *why*.** Don't narrate what the code already says.
- **No fallback / demo / mock modes.** If a probe needs real Nostr, run real Nostr.
- **CRLF awareness.** When string-replacing in HTML files via `exec:nodejs`, use `\r?\n` in regexes — Git on Windows stores some HTML with CRLF.
- **Importmap edits must update *the inline injector script*** in `docs/nostr-chat/index.html`, not a literal `<script type="importmap">` (there isn't one).

## Non-obvious technical caveats

**SDK AppShell `.app` flex-direction collision** — anentrypoint-design's AppShell renders `<div class="app">` with `flex-direction: column`. Zellous nostr-chat's `discord.css` also uses `.app` with `flex-direction: row` for the chat layout. When `installStyles()` runs, the SDK's inline stylesheet overrides discord.css. Without the override, the chat renders as a column. Fix: `docs/css/sdk-shell.css` declares `html.ds-247420 .app { display:flex !important; flex-direction:row !important }` with mobile `@media` override to `column`.

**CSS specificity + min-width inheritance** — `chat-surface.css` uses `.server-list` and `#serverList` (id selectors), which beat `html.ds-247420 .server-list`. When collapsing the server list via `width:0`, the list doesn't shrink because `discord.css` pins `.server-list { min-width: var(--server-list-width) }`. Fix: on collapsed state, include `#serverList` selector AND `min-width: 0 !important` to override the inherited min-width from discord.css and allow true collapse.

**Windows static dev server path traversal** — When implementing path traversal checks for a dev server on Windows, use `path.resolve(ROOT)` + `path.resolve(path.join(ROOT, p))` for normalization. Raw `startsWith()` on forward-slash ROOT vs backslash-joined paths fails because backslashes don't normalize correctly for string comparison.

**Playwriter (exec:browser) viewport API** — playwriter uses Playwright's `page.setViewportSize({width, height})`, NOT puppeteer's `page.setViewport()`. The method name and parameter structure differ. Ensure viewport manipulation code targets Playwright, not puppeteer.

**AppShell `.app-body` grid-to-flex override** — anentrypoint-design's AppShell `.app-body` renders as `display: grid`. Overriding to flex requires both `display:flex !important` AND `grid-template-columns:none !important` to clear grid tracks. Setting display:flex alone loses the cascade against the grid definition.

**AppShell `.app-main` padding cascade** — anentrypoint-design's `.app-main` ships with `padding: 16px 20px 72px`. Unprefixed `padding:0` from wrapper stylesheets loses the cascade. Override requires `!important` flag.

**AppShell `.app-body.no-side` element retention** — When `.app-body.no-side` is set, the SDK still renders the `.app-side-shell` element off-screen via fadeOutLeft animation. It still consumes a grid track or flex item. To reclaim the space, explicitly hide it: `.app-body.no-side > .app-side-shell { display:none }`.

**Viewport height overflow from iframe min-height clamp** — site/theme.mjs embedClient: using iframe `height: calc(100vh - 180px); min-height:520px` causes body overflow on standard desktop sizes (e.g., bodyH 970px > viewport 900px). Fix: lock html/body/#app/.app/.app-body/.app-main to flex column with `height:100vh; overflow:hidden`, iframe `height:100%`, and remove the min-height clamp.

**Flatspace build command and output** — Flatspace is invoked via `npx --yes flatspace@latest build` (see .github/workflows/gh-pages.yml). There is no local build script in package.json; the command must be run directly. Build output goes to ./dist.

**docs/sdk/ vs docs/vendor/ gitignore split** — `docs/vendor/` is gitignored (third-party drops). `docs/sdk/` is NOT gitignored and is committed. SDK assets (e.g. `247420.js` copied from `node_modules/anentrypoint-design/dist/`) belong in `docs/sdk/`, not `docs/vendor/`.

**SDK JS+CSS consumed LIVE from anentrypoint-design's GitHub Pages (2026-05-27, supersedes the vendored approach)** — the inline importmap injector in `docs/nostr-chat/index.html` maps `anentrypoint-design` → `https://anentrypoint.github.io/design/247420.js`, and the single stylesheet `<link>` points at `https://anentrypoint.github.io/design/247420.css` (bundled: colors_and_type + app-shell + community + editor-primitives, all scoped under `.ds-247420`, matched by `<html class="ds-247420">`). The old vendored copies (`docs/sdk/247420.{js,css}` and `docs/css/vendor/*`) were **deleted** — zellous no longer carries an SDK copy and auto-tracks the SDK's gh-pages deploy. To propagate an SDK change: `node scripts/build.mjs` in `C:\dev\anentrypoint-design`, commit + push; gh-pages redeploys (~30–60s) and zellous picks it up on next load. **Tradeoff:** zellous boot now depends on `anentrypoint.github.io` being reachable; the SDK import is wrapped in try/catch and sets `window.__sdk = null` on failure (graceful-degrade, no hard crash). npm publish remains blocked (no auth). Note: `https://anentrypoint.github.io/design/community.css` and `editor-primitives.css` are **404** individually — only the bundled `247420.css` carries `.cm-*`/`.vx-*`/`.ov-*`; do not link the individual cssPart names from gh-pages.

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
    wireweave/src/                   ←  protocol implementation (real logic)
    {preact,xstate,nostr-tools,…}    third-party
  css/
  msgpackr.min.js                    binary codec
site/                                flatspace inputs (theme + content)
flatspace.config.mjs                 build config (CI only)
dist/                                CI build artifact
scripts/fetch-vendor.js              vendored-dep fetcher
```

**Legacy overlays/inputs with no `position` rule inflate `document.body.scrollHeight`** — post-SDK-migration, several legacy DOM elements survive in `nostr-chat/index.html` still wired to legacy controllers (`#videoPlayback` toggled by webcam.js, `#settingsPopover` toggled by ui-actions.toggleSettings, `#fileInput.hidden-input`). They carried NO CSS `position`/`display` rule, so they defaulted to `position:static; display:block` and sat in normal flow *below* the SDK AppShell, inflating `document.body.scrollHeight` (witnessed 1358 vs 900 viewport). Because `html,body { overflow:hidden }` is set, this produced no visible scrollbar — a silent latent bug. Fix (commit fdd4d28): `zellous.css` now positions `.video-playback` + `.settings-popover` as `position:fixed; display:none` overlays (z-index 2600) and `.hidden-input` as the canonical visually-hidden 1px clip. When you add any always-present overlay/trigger element to index.html, give it a `position:fixed`/`absolute` + hidden-by-default rule or it will inflate body height. Verify with `document.body.scrollHeight <= window.innerHeight` in a browser witness.

**GUI surface validation (2026-05-28)** — full validation pass witnessed all 27 SDK component mounts rendering live (`window.__sdk.C` has 158 exports, all 27 community/voice/overlay component names present as `function`, missing=[]). Always-on surfaces (`zRoomList` server/room rail 19 nodes, `chatArea` 14 nodes) render; overlays (cmd palette z1000, emoji, context-menu, auth-modal 12 nodes, toast z9999) render real DOM on trigger; voice view renders 16 nodes + 6-button controls bar on voice-channel switch; dark theme `data-theme=ink` tokens resolve (`--bg:#131318 --fg:#F6F5F1 --accent:#3A9A34`); responsive clean at 375/768/1280 with no overflow on either axis; zero console errors throughout. The legacy `#serverList/#channelSidebar/#chatHeaderBar/#memberList` hosts are `display:none` **by design** (content migrated to SDK mounts) — not a layout bug.

**SDK chrome uses an `Icon(name)` SVG set, not color-emoji** — anentrypoint-design `shell.js` exports `Icon(name, {size})` → inline `currentColor` SVG. The set covers voice/chrome (`mic`, `mic-off`, `speaker`, `speaker-off`, `camera`, `screen`, `phone`, `members`, `menu`, `settings`, `paperclip`, `smile`, `more-horizontal`, `arrow-up`, `send`) AND channel-type icons (`hash` text, `megaphone` announcement, `forum`, `page`, `thread`). It is barrel-exported and used at every voice/chrome/channel call site: `VoiceControls`/`VoiceStrip`/`UserPanel`/`MobileHeader`/`PttButton`/`WebcamPreview`/`AppShell` side-toggle, and the `ChannelItem`/`MobileHeader` channel-type mapping (`ICON_FOR` in `community.js`). The zellous `sdk-rooms.js` rail renders `sdk.C.Icon(iconName)` (hash/megaphone/forum/page/speaker) — it does NOT carry its own glyph vocabulary. Geometric symbol glyphs (✕ ⚙ ◻ ◉ ◆ § ●) and the `↗` external-link affordance are kept — clean monospace symbols, design-idiomatic. The `EmojiPicker` category data (😀👍❤️✅…) is legitimate product content, exempt. When adding chrome/channel icons, add a path to `shell.js` `ICON_PATHS` and use `Icon()`, never emoji. zellous consumes the built `247420.js` live via gh-pages.

**`window.__contextMenu.show(items,x,y)` item shape is `{label, danger, disabled, icon, onSelect, separator}` — NOT `onClick`** — the SDK `C.ContextMenu` reads `{items, anchor:{x,y}, onClose}` and calls `it.onSelect`. The zellous `sdk-context-menu.js` mount passes `anchor:{x,y}` and gates render on `open`. Use `onSelect` for item handlers; `moderation.showMemberMenu` is the reference caller. The menu clamps to the viewport (near-edge opens stay on-screen) by positioning at the anchor then re-clamping inside `requestAnimationFrame` — clamping synchronously in the `ref` callback measures a zero-size box (children not yet painted) and silently no-ops, so the clamp MUST run post-layout.

**Persistent user panel is its own mount, NOT `C.ChannelSidebar`** — zellous does not mount `C.ChannelSidebar` (its `sdk-channel-sidebar.js` is only a neuter stub hiding the legacy `#channelSidebar` and no-opping `uiChannels.render`). The server+channel rail is `sdk-rooms.js` → `#zRoomList`. The self-identity user panel (avatar/name/tag + mic/deafen/settings via `Icon()`) is `sdk-user-panel.js` → `C.UserPanel`, mounted persistently in `#userPanelSlot` (just below `#voiceStripSlot`), wired to `micMuted`/`voiceDeafened` signals + `ui.actions.toggleSettings`. The `C.VoiceStrip` (`#voiceStripSlot`) only shows while in voice.

**Chat-surface chrome is ONE app bar + the SDK chat-head — no breadcrumb** — the chat surface previously stacked three redundant header rows: a hand-authored `.app-topbar` (brand + nav, in `index.html`), a hand-authored `.app-crumb` breadcrumb (`zellous › server › channel`), and the SDK `C.Chat` `.chat-head` (`channel · subtype`). The breadcrumb duplicated the topbar + chat-head channel identity and read as "two navbars". The `.app-crumb` is removed — the `.app-topbar` (sole app bar; `ui-shell.js` `wireCrumb()` updates `#zBreadName`) plus the SDK `.chat-head` are the only chrome. Do not re-add a breadcrumb. The SDK `C.Chat` chat-head hides its message-count entirely when `messages.length===0` and shows a plain singular/plural count (`1 message` / `N messages`) otherwise — never the old zero-padded `String(len).padStart(2,'0')+' msgs'` ("00 msgs"). The `#zStatus*` footer counts are live (`no messages` / `N message(s)`, live room count) — no hardcoded literals.

**No mock/demo data in render paths (reaffirmed 2026-05-28)** — `sdk-rooms.js` had fabricated fallback channels (`general/design/releases/lore` with fake counts) and fake DM pills (`jordan/mai/aicat`) rendered when state was empty. These violated the no-mock rule and were removed (replaced with a `.rail-empty` "no channels yet" placeholder). When a surface has no real data, render an empty-state, never fabricated sample rows.

**Legacy thread/forum renderers are neutered — SDK mounts own rendering** — `threads.js` `renderPanel`/`renderForumPosts` are now no-ops (the data store `_threads`/`setThreads`/`addThread`/`updateFromChannels` is kept). `sdk-thread-panel.js`/`sdk-forum-view.js` (C.ThreadPanel/C.ForumView) are the sole renderers. `zellous.css` hides the legacy duplicate chrome (`#threadPanel > .thread-panel-header/#threadList`, `#forumView > .forum-header-bar/#forumPosts`) so panels show one close button / one post list. Don't re-add rendering to threadManager.

**Disk-full destabilizes the `browser` verb's chromium (2026-05-28 incident)** — when `C:` hit 100% (≈13M free on a 1.9T disk), a `Write`/`Edit` truncated a file to 0 bytes (ENOSPC mid-write — restore from git and retry once space is freed) AND the playwriter chromium began crashing with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` on any long-busy operation (`goto`+`waitForFunction`). Recovery: (1) `git checkout -- <file>` to restore truncated files; (2) close the browser session, `Stop-Process` the orphaned `ms-playwright` chrome.exe procs (filter CommandLine `*ms-playwright*` — do NOT kill the user's personal Chrome), `rm -rf .gm/browser-profile` (gitignored, recreatable) to reclaim space; (3) spawn a fresh `session new`. A short `waitForTimeout`-based witness body succeeds where a long `waitForFunction` body crashes the destabilized chromium — prefer the former under disk pressure.

## Learning audit

2026-04-30: 5 items sampled (importmap, preact, wireweave, crlf, path-traversal). Recall: 0/5. All retained in AGENTS.md. rs-learn store empty; gradual population expected in future sessions.
2026-05-01: 5 items sampled (importmap-injection, crlf-html, windows-path-traversal, appshell-flex-collision, playwriter-viewport). Recall: 0/5. All retained in AGENTS.md. All 5 ingested into rs-learn this session. 6 new SDK integration facts also ingested (sdk-bundle-location, sdk-importmap-entry, dev-server-mime-types, sdk-window-global, sdk-wiring-points, appready-no-relay). 2 new AGENTS.md caveats added (docs/sdk/ gitignore split, static server MIME types).
2026-05-01 (session 2): 5 items sampled (importmap-injection, crlf-html, appshell-flex-collision, playwriter-viewport, docs-sdk-gitignore). Recall: 0/5. All retained. All 5 re-ingested with refined wording. 1 new AGENTS.md caveat added (sdk-shell.css ID selector specificity for dark theme).
2026-05-01 (session 3): 5 items sampled (importmap-injection, preact-signals, wireweave-protocol, flatspace-build, vendor-gitignore). Recall: 0/5. All retained. 4 new facts ingested into rs-learn (mjs-mime-type-port-5173, zellous-css-rebuild-2026-05-01, zellous-css-load-order, homemode-state-routing). 2 new AGENTS.md caveats added (design-tokens-unification, dev-server-mjs-mime-type).
