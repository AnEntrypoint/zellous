# Zellous — Technical Reference

Zellous is a fully serverless voice + chat app over public Nostr relays. No backend.
The protocol/runtime layer lives in a vendored `wireweave` library; the app is a thin UI shell that bridges wireweave managers onto window globals.

## Surfaces

Two HTML entry points + one CI-built landing:

| Path | Purpose |
|---|---|
| `docs/index.html` | Marketing landing (static, hand-authored) |
| `docs/nostr-chat/index.html` | The actual app — bootstraps wireweave + UI |
| `dist/index.html` | Flatspace-built site landing (CI artifact, see "Flatspace") |

Deploy: GitHub Pages serves `docs/`. Local: any static server pointed at `docs/`.

## Bootstrap (docs/nostr-chat/index.html)

The page does its own work in inline scripts in this order:

1. **Theme init** — reads `localStorage['zellous-theme']` before paint.
2. **Importmap injection** — a classic script *dynamically* injects a `<script type="importmap">` mapping bare specifiers (`htm`, `preact`, `preact/hooks`, `@preact/signals`, `@preact/signals-core`, `nostr-tools`, `xstate`) to `../vendor/*.mjs`. Static greppers will not see this importmap because it isn't literal in the HTML.
3. **`window.__zellous = {}`** — namespace seeded; backward-compat placeholders set on window root (`window.lk = null`, `window.auth = null`, etc.).
4. **`__boot` reporter** — progress bar + watchdog.
5. **`<script src="../msgpackr.min.js">`** — vendored binary codec.
6. **Module bootstrap (`<script type="module">`)** —
   - Imports `signal/computed/effect` from `@preact/signals` → `window.__signal/__computed/__effect`.
   - `await import('../js/state.js')` → `window.config`. `state.js` itself sets `window.state` and `window.stateSignals` as a side effect (via top-level code that writes to window).
   - Imports `nostr-tools` → `window.NostrTools`.
   - Imports `{createMachine, createActor}` from `xstate` → `window.XState`.
   - Sets `window.__appBase` from `import.meta.url`.
   - Loads `js/wireweave-bridge.js` first; awaits `window.__wireweaveReady`.
   - Then parallel-loads the remaining 16 classic scripts (`Promise.all` of `<script async=false>` injections — preserves execution order while fetching concurrently).
   - Wires a single `effect()` over every signal that drives UI rerender.
   - Sets `window.appReady = true`.

There is no other entry point. Anything claiming a different load order is stale.

## App modules (`docs/js/`)

Every file here is a classic script (no exports, mutates window). All but `state.js` and `wireweave-bridge.js` consume already-bridged managers.

| File | Role |
|---|---|
| `state.js` | ESM. Exports `state, config`. Imports `signal` from `@preact/signals` (only ESM file in `docs/js/` that is `import`ed rather than `<script>`-loaded). |
| `wireweave-bridge.js` | **The bridge.** Dynamic-imports `../vendor/wireweave/src/index.js`, instantiates managers, and exposes them as `window.{nostrNet, auth, chat, channelManager, serverManager, serverRoles, serverSettings, serverPages, nostrBans, nostrMedia, nostrVoice, nostrVoiceRtc, nostrVoiceSfu, nostrVoiceCamera, message, nostrFsm, lk}` plus mirrors them under `window.__zellous`. Sets `window.__wireweaveReady` (a promise the loader awaits). |
| `ui.js` | DOM refs + render dispatch (`ui.render.all`, `ui.render.messages`, etc.). |
| `ui-actions.js` | `ui.actions.{switchChannel, sendChat, …}`. Voice click triggers `lk.connect()`/`disconnect()`. |
| `ui-channels.js` | Channel list render. `.voice-connecting` spinner, `.voice-active` styling. |
| `ui-chat.js` | Chat message render + emoji reactions + delete affordance. |
| `ui-voice.js` | Voice grid render. No join overlay; grid renders on channel switch. |
| `nostr-channels-ui.js` | Channel modals, context menus, drag-and-drop. Augments `channelManager`. |
| `nostr-servers-ui.js` | Server context menu, edit/create/join-preview modals. Augments `serverManager`. |
| `audio.js` | Opus codec via WebCodecs (24 kbps, 48 kHz, mono, 4096-sample chunks). |
| `queue.js` | Audio segment queue, replay, download. |
| `files.js` | File upload/download, drag-drop, clipboard paste. |
| `ptt.js` / `voice-ptt.js` | PTT, deafen, VAD wiring. |
| `webcam.js` | Webcam capture/playback. |
| `threads.js` | Threaded channel support. |
| `moderation.js` | Member moderation actions (kick/ban/timeout via `nostrBans`). |
| `icons.js` | SVG icon registry → `window.icons`, `window.getIcon`. |

## Wireweave (`docs/vendor/wireweave/src/`)

Vendored library — **the real implementation** of every Nostr protocol concern. Modules: `index.js` (factory), `wireweave.js` (orchestrator), `relay-pool.js`, `auth.js`, `chat.js`, `message.js`, `channels.js`, `servers.js`, `roles.js`, `bans.js`, `settings.js`, `pages.js`, `media.js`, `voice.js`, `fsm.js` (XState v5 machines), `debug.js`. All other vendor dirs (`preact`, `xstate`, `webjsx`, `nostr-tools`) are pure third-party drops.

`wireweave-bridge.js` is the **only** consumer of this library. To change protocol behavior, edit wireweave; to change app surface, edit the bridge.

## Vendored deps (`docs/vendor/`)

Importmap-resolved: `preact.mjs`, `preact-hooks.mjs`, `preact-signals.mjs`, `signals-core.mjs`, `htm.js`, `nostr-tools.mjs`, `xstate.mjs`. Plus `msgpackr.min.js` at `docs/`. Fetch script at `scripts/fetch-vendor.js`.

`livekit-client` is **not** in the importmap (legacy mention in older docs is stale — the app is Nostr-only).

## CSS

`docs/css/`: `discord.css` (base layout), `tokens.css` (design tokens), `247420.css` (brand accent), `chat-surface.css`, `animations.css`, `flow.css`, `ripple.css`. Plus `docs/vendor/fonts.css` and `docs/vendor/rippleui-1.12.1.css`. Mobile breakpoint `<768px`; touch targets ≥ 44px.

## State / signals

`docs/js/state.js` defines `state` (a plain object whose properties are `signal()` instances) and exposes:
- `window.state` — the object itself (signals as values).
- `window.stateSignals` — the same signals.
- `window.config` — `{ chunkSize, sampleRate }`.

UI subscribes via the single `effect()` in the bootstrap module script.

## Voice

WebRTC mesh; signaling over Nostr kind 30078 events. SFU upgrade at 3+ peers (lowest-RTT peer becomes hub). Implementation lives in `docs/vendor/wireweave/src/voice.js` + `fsm.js`. The bridge exposes `window.lk` / `window.nostrVoice` / `window.nostrVoiceRtc` / `window.nostrVoiceSfu` / `window.nostrVoiceCamera` shims pointing at it.

Empirical reliability patterns (preserved from prior debugging — still apply because wireweave inherited them):
- **Perfect Negotiation (RFC 8840)**: lower-pubkey peer is polite. Rollback uses `pc.setLocalDescription({type:'rollback'})`, never `null`.
- **Answerer transceiver gap**: before `createAnswer()`, ensure an audio receiver transceiver exists (`addTransceiver('audio', {recv:true})`) or the offerer's audio is silently dropped.
- **Hub death recovery**: on hub peer close, `_dissolve()` immediately, schedule re-election at 500 ms — don't wait for the 30 s heartbeat.
- **Exponential backoff reconnect**: `min(2^attempt * 2000, 30000)`, max 6 attempts. Cancel on success or fresh presence.
- **Mobile recovery**: `visibilitychange` / `online` / `pageshow` all funnel through a 500 ms-debounced `healPeers()`. No-op when no active session.
- **Track stall detection**: `track.onended` → `doIceRestart()`; 5 s interval checks `srcObject.getTracks().every(t => t.readyState === 'ended')`. Use a per-peer flag to prevent cascading restarts.
- **getStats RTT**: filter `type==='candidate-pair' && state==='succeeded'`; field is `currentRoundTripTime` (seconds).
- **`playoutDelayHint`**: Chrome 87+ only, partial in Firefox — always wrap in try/catch.
- **DTX / SDP munging**: don't try to control either in Chrome 120+; both deprecated/unreliable.

## XState v5

Vendored at `docs/vendor/xstate/es2022/`, proxied via `docs/vendor/xstate.mjs`. Bridge exposes `window.XState = { createMachine, createActor }`. Wireweave uses these for `voiceMachine`, `peerMachine`, `cameraMachine` (`docs/vendor/wireweave/src/fsm.js`).

Actor API in classic scripts:
- `XState.createActor(machine).start()`
- `actor.send({type:'evt'})` (object form, not string)
- `actor.getSnapshot().{value, matches('s'), can({type:'evt'})}`
- `actor.subscribe(snap => …)` — does **not** fire on `start()`, only on transitions.

## Embedding

The app exposes `window.__zellous.embed` (postMessage bridge). Parent calls `getState`, `joinRoom`, `leaveRoom`, `sendMessage` via `iframe.contentWindow.postMessage({type, id, …})` and listens for `{type:'response', id, result}` or `{type:'error', id, error}`. Iframe also emits `ready`, `user-joined`, `user-left`, `message-sent`, `error` events.

CSS uses `100%` heights (not `100vh`), so the iframe respects its container. No `X-Frame-Options` set by GH Pages, so embedding is unblocked. Recommended sandbox: `allow-scripts allow-same-origin`. Validate `message.origin` server-side (in iframe) before acting.

## Flatspace + theme

Root has `flatspace.config.mjs` (`{ outDir: 'dist', contentDir: 'site/content', theme: './site/theme.mjs' }`) and `site/` (theme + content YAML). Flatspace runs in CI and writes `dist/index.html`. The theme imports `anentrypoint-design` (CDN-pinned via SDK installer at runtime). No local `flatspace` install is needed.

`docs/index.html` is the static landing actually served by GH Pages. `dist/index.html` is currently retained but is the build artifact, not the live page. Keep them in lockstep when redesigning.

## localStorage keys

- `zn_sk` / `zn_pk` — Nostr private/public key (active).
- `nostr_pubkey` / `nostr_privkey` — deprecated migration aliases (read on load).
- `zn_servers`, `zn_joined_servers`, `zn_lastServer`, `zn_serverOrder` — server membership and ordering.
- `zellous_rnnoise`, `zellous_forceRelay` — settings toggles.
- `zellous-theme` — theme preference (read pre-paint).

## Debug surfaces

- `window.__debug` — read-only getter aggregating `voice`, `net`, `roles`, `settings`, `media`, `pages`.
- `window.__debugNet` — relay status map.
- `window.__voiceRetrySchedule` — created on demand when reconnect logic kicks in (absent under normal operation).

## Windows / CRLF

`docs/nostr-chat/index.html` is checked in with CRLF on Windows. When doing string replacements via `exec:nodejs`, regexes need `\r?\n` if they care about line endings.

## Validation playbook

The whole repo can be witnessed end-to-end with:

1. Parse-check every first-party `.js`/`.mjs` (`node --check`).
2. Boot a static server over `docs/` and request `/`, `/nostr-chat/`, plus a sampling of `/js/*` and `/vendor/*`.
3. Headless-browser to `/nostr-chat/`, wait for `window.appReady === true`, assert each documented global resolves, capture console errors and request failures.

External Google Fonts requests are expected to fail in offline/sandboxed environments — that is not a project bug.
