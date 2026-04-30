# AGENTS.md — Operating Guide for Coding Agents

This file is for agents (Claude Code, etc.) working in this repo. For the architecture reference, read `CLAUDE.md` first; this file only adds operational discipline.

## Repo shape (one-liner)

Static GH-Pages app under `docs/`. Real protocol logic in `docs/vendor/wireweave/src/`. Window globals are wired in `docs/js/wireweave-bridge.js`. No backend, no build for the app itself; `flatspace.config.mjs` + `site/` only build the marketing landing into `dist/`.

## What you almost certainly want to edit

| Goal | Edit here |
|---|---|
| Change UI render / layout | `docs/js/ui*.js`, `docs/css/*.css`, `docs/nostr-chat/index.html` |
| Change protocol behavior (Nostr events, voice signaling, etc.) | `docs/vendor/wireweave/src/*.js` |
| Expose / rename a window global | `docs/js/wireweave-bridge.js` (mirror under `window.__zellous`) |
| Add a vendored dep | `scripts/fetch-vendor.js`, then add an importmap entry inside the inline injector script in `docs/nostr-chat/index.html` |
| Touch state | `docs/js/state.js` (single source of truth for signals) |
| Marketing landing | `docs/index.html` (live) and/or `site/` + `flatspace.config.mjs` (CI-built `dist/`) |

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
