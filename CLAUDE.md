# Zellous - Technical Reference

## Architecture Overview

Zellous is a fully serverless voice and chat app using public Nostr relays. No backend required.

### Entry Point
- `docs/nostr-chat/index.html` — main app (GH Pages static site)
- Loads `js/state.js` from root via `../js/state.js` import
- Loads all other scripts from `docs/js/` via base URL resolution

### Client Modules (docs/js/)
- `ui.js` — DOM references and render dispatch functions
- `ui-actions.js` — `ui.actions`: `switchChannel` (triggers `lk.connect()` on voice click; disconnect on re-click), auth modal, chat send, file upload, mobile drawer
- `ui-channels.js` — Channel list render. Shows spinner on `.voice-connecting` state, `.voice-active` on connected voice channel
- `ui-voice.js` — Voice grid render. No join overlay — grid renders immediately on channel switch
- `ui-chat.js` — Chat message rendering, emoji reactions
- `nostr-auth.js` — Nostr key management (nsec/npub), NIP-07 extension support
- `nostr-state-patch.js` — Patches state signals for nostr mode
- `nostr-network.js` — Nostr relay connection, event pub/sub (relay management, subscribe, publish)
- `nostr-message.js` — `message` object: add system messages, dispatch to handlers
- `nostr-fsm.js` — XState v5 machines (`voiceMachine`, `peerMachine`) via `XState.createMachine`. See XState section below.
- `nostr-voice.js` — Voice session FSM, connect/disconnect, presence heartbeat, mic/deafen controls
- `nostr-voice-rtc.js` — WebRTC peer management: `maybeConnect`, ICE gathering, offer/answer exchange, `handleSignal`, `publish`
- `nostr-chat.js` — Chat over Nostr events
- `nostr-channels.js` — Channel management via Nostr
- `nostr-channels-ui.js` — Channel modals, context menus, drag-and-drop
- `nostr-servers.js` — Server (community) management via Nostr. Core: `create`, `join`, `leave`, `delete`, `switchTo`, `renderList`. Right-click on server icon calls `showContextMenu`. `showJoinPreview(serverId, onConfirm)` shows preview modal before joining via `?room=` param
- `nostr-servers-ui.js` — Server UI methods augmented onto serverManager: `showContextMenu`, `showEditModal`, `showJoinPreview`, `showCreateModal`. Mirrors nostr-channels-ui.js pattern. Invite URL: `location.origin + location.pathname + ?room=<serverId>`
- `audio.js` — Opus encoding/decoding, playback, pause/resume
- `queue.js` — Audio segment queue, replay, download
- `files.js` — File upload/download, drag-drop, clipboard paste
- `ptt.js` — PTT, deafen, VAD
- `webcam.js` — Webcam capture/playback
- `threads.js` — Threaded channel support
- `moderation.js` — Member moderation actions
- `icons.js` — SVG icon registry

### Shared State Module (js/)
- `js/state.js` — Config, state object, room URL parsing. Loaded via `../js/state.js` in index.html

### CSS Design
- `docs/css/discord.css` — Original minimal dark design (not Discord clone)
- Key vars: `--bg-base: #0f1117`, `--bg-surface: #1a1d27`, `--bg-raised: #252836`, `--accent: #6c63ff`
- Mobile: server list is fixed bottom horizontal bar at `<768px` with `env(safe-area-inset-bottom)`
- Touch targets min 44px on all interactive elements

### Nostr Voice (Serverless)
Voice uses native WebRTC mesh with Nostr kind 30078 events as signaling channel.

- `nostr-voice.js` + `nostr-voice-rtc.js` — Together set `window.lk = nostrVoice`
- Media transport: native `RTCPeerConnection` + `getUserMedia({audio:true})`; remote audio via `new Audio()` elements
- Signaling: kind 30078 events with `d` tag `zellous-rtc:<roomId>:<toPubkey>:sdp` (offer/answer) and `:ice` (batched ICE candidates)
- Initiator rule: peer with lexicographically higher pubkey creates the offer
- ICE candidates batched once on `iceGatheringState === 'complete'`; buffered until remote description set
- Room IDs: SHA-256 hash of `serverId:voice:channelName`, prefixed `zellous`, truncated 16 hex chars
- Presence: kind 30078 events with `d` tag `zellous-voice:<roomId>`, 30s heartbeat, 90s expiry
- Interface: `connect(channelName)`, `disconnect()`, `toggleMic()`, `toggleDeafen()`, `toggleCamera()`, `updateParticipants()`, `isDataChannelReady()`

## Audio Pipeline
- Codec: Opus via WebCodecs API (24kbps, 48kHz, mono)
- Chunk size: 4096 samples (~85ms)
- Binary transport: msgpackr.min.js (vendored client bundle)

## Dependencies (client-side, vendored in docs/vendor/)
- preact, @preact/signals — UI reactivity
- htm — JSX-like template literals
- livekit-client — LiveKit SDK (for optional LiveKit mode)
- nostr-tools — Nostr protocol utilities
- msgpackr.min.js — Binary message encoding

## Deploy
Static site — no build step required.
```bash
npx serve docs
```

## Nostr Voice SFU (nostr-voice-sfu.js)

Hub election: peer with lowest average RTT to all others becomes hub. RTT scores are carried inside kind 30078 heartbeat presence events so every peer can build a full RTT matrix. Topology switches mesh→star at 3+ peers.

Hub forwarding uses `sender.replaceTrack(receiver.track)` — Chrome and Firefox both accept a remote `MediaStreamTrack` directly; no insertable streams required.

### WebRTC browser caveats (discovered empirically)

- **RTT from getStats**: filter by `type === 'candidate-pair' && state === 'succeeded'`; field is `currentRoundTripTime` in seconds.
- **playoutDelayHint**: `RTCRtpReceiver.playoutDelayHint` is Chrome 87+ only, Firefox partial — always set inside `try/catch`.
- **FEC/RED**: on by default for Opus in Chrome; no action needed.
- **DTX**: cannot be reliably disabled via `setParameters` in Chrome 120+; skip DTX control entirely.
- **SDP munging**: deprecated for codec params in Chrome 120+; do not use.

### Debug surfaces
- `window.__debugNet` — relay latency per relay
- `nostr-voice.js.__debug` — includes SFU state (hub election result, forwarding map)

## XState v5 Integration

XState v5 is vendored at `docs/vendor/xstate/es2022/` with proxy at `docs/vendor/xstate.mjs`.

### Loading pattern (docs/nostr-chat/index.html)
1. importmap entry: `"xstate": "../vendor/xstate.mjs"`
2. type="module" script block assigns: `import {createMachine,createActor} from 'xstate'; window.XState = {createMachine,createActor}`
3. Classic scripts access via `window.XState.createMachine`, `window.XState.createActor`

### Actor API in classic scripts
- Create actor: `XState.createActor(machine)`, then `actor.start()`
- Send events: `actor.send({type:'eventName'})` — NOT `actor.send('eventName')`
- Check state: `actor.getSnapshot().matches('stateName')` — NOT `actor.is()`
- Can check: `actor.getSnapshot().can({type:'eventName'})` — NOT `actor.can()`
- Get state value: `actor.getSnapshot().value` — NOT `actor.state`
- Subscribe: `actor.subscribe(snap => { /* snap.value is current state */ })`
- **Important**: subscribe() does NOT fire on `actor.start()` — only on transitions

## Windows / CRLF Caveat

On Windows, git may store `docs/nostr-chat/index.html` with CRLF line endings. When doing string replacements via `exec:nodejs`, use `\r\n` in regex patterns if `\n` alone doesn't match.

## WebRTC Voice Reliability Patterns (Empirically Discovered)

The following patterns were discovered through multiple failed test runs and are critical for stable peer-to-peer voice.

### 1. Perfect Negotiation (RFC 8840)
**Problem**: Offer race conditions cause one-direction audio — offerer's audio has no receiver.  
**Fix**: Implement politeness roles. Peer with lower pubkey = polite. On offer collision:
- Polite: `pc.setLocalDescription({type:'rollback'})` (NOT null), then accept remote offer
- Impolite: Ignore own offer, accept remote offer  
**Why `{type:'rollback'}` not null**: Chrome 90+ and Firefox support this form; null is deprecated.

### 2. Answerer Transceiver Gap
**Problem**: Answerer calls `createAnswer()` before remote offer's audio track arrives; offerer's audio is silently discarded.  
**Fix**: Before `createAnswer()`, check `pc.getTransceivers().some(t=>t.receiver.track&&t.receiver.track.kind==='audio')`. If absent, `pc.addTransceiver('audio', {recv:true})`.  
**Why**: Answerer must have a transceiver registered before answering, or the offerer's audio receiver has nowhere to go.

### 3. Hub Death Recovery
**Problem**: In star SFU, when hub peer closes (`connectionState===closed`), rebuild waits 30s for next heartbeat.  
**Fix**: On peer close, call `_dissolve()` immediately, then schedule `_maybeElect()` at 500ms.  
**Why**: Don't wait for heartbeat expiry to recover hub election.

### 4. Exponential Backoff Reconnect
**Problem**: Rapid reconnect storms on transient failures; exhausts relay quota.  
**Fix**: After `_closePeer`, delay = `Math.min(2^attempt * 2000, 30000)` (max 6 attempts). Track in `window.__voiceRetrySchedule`. Cancel on successful connect or fresh presence event.  
**Why**: Adaptive backoff survives network hiccups without hammering relays.

### 5. Mobile Recovery Pattern
**Problem**: App backgrounding or connectivity loss leaves peers in stale state.  
**Fix**: Three listeners at module bottom:
- `visibilitychange` — hidden=set flag, visible=call `healPeers()`
- `online` — call `healPeers()`
- `pageshow` — if persisted or flag set, call `healPeers()`  
All funnel through 500ms debounce. No-op if no active voice session (`nv._roomId` empty).  
**Why**: Covers browser backgrounding, network reconnect, and page restoration.

### 6. Track Stall Detection
**Problem**: Remote track ends silently; peer still appears connected in UI.  
**Fix**: Two mechanisms:
- `track.onended` → `doIceRestart()` if FSM=connected
- 5s interval: check `srcObject.getTracks().every(t=>t.readyState==='ended')` → restart  
Use `peer.trackEndedRestart` flag to prevent multiple triggers.  
**Why**: Catches both explicit track end and silent stall; prevents cascading restarts.

### 7. nostrVoiceRtc Structure Pattern
**Problem**: Methods added to object need to reference object itself; closures capture `undefined`.  
**Fix**: Define object with all core methods, assign to `window.nostrVoiceRtc`, THEN append additional methods as properties (e.g., `nostrVoiceRtc.cancelReconnect = ...`). Event listeners at file bottom.  
**Why**: Allows closures to reference fully-initialized object after module load.

### 8. XState v5 Rollback Form
**Problem**: Some codebases use `setLocalDescription(null)` for rollback; fails in Firefox.  
**Fix**: Always use `pc.setLocalDescription({type:'rollback'})` when rolling back.  
**Why**: Explicit type is the RFC 8840 standard; null is non-standard and Firefox-incompatible.

## Embedding Zellous (Iframe)

Zellous can be embedded in parent pages via iframe. Key constraints and global surface documented below.

### Global Surface Audit

**window.* assignments (47 total)**:
- **Root state**: `window.state`, `window.stateSignals`, `window.config`
- **Lifecycle**: `window.appReady` (boolean flag set on init completion)
- **Utilities**: `window.__signal`, `window.__computed`, `window.__effect` (Preact signals)
- **Libraries**: `window.NostrTools`, `window.XState`
- **Core subsystems**: `window.auth`, `window.nostrNet` / `window.network`, `window.nostrVoice`, `window.lk` (LiveKit hybrid)
- **Voice subsystems**: `window.nostrVoiceRtc`, `window.nostrVoiceSfu`, `window.nostrVoiceCamera`
- **Chat/channels**: `window.chat`, `window.message`, `window.channelManager`, `window.serverManager`, `window.threadManager`
- **Admin/roles**: `window.serverRoles`, `window.serverSettings`, `window.serverPages`, `window.nostrBans`, `window.nostrMedia`
- **Audio**: `window.audio`, `window.queue`, `window.ptt`, `window.deafen`, `window.vad`, `window.webcam`
- **UI**: `window.ui`, `window.uiChat`, `window.uiVoice`, `window.uiChannels`, `window.uiMembers`
- **Files**: `window.fileTransfer`
- **Debug**: `window.__debug` (read-only getter), `window.__debugNet`, `window.__voiceRetrySchedule`
- **Helpers**: `window.getIcon`, `window.icons`, `window.moderation`, `window.getInitial`, `window.getAvatarColor`, `window.escHtml`, `window.formatTime`, `window.chIcon`

**importmap entries** (in `<script type="importmap">`):
- `htm` → `../vendor/htm.js`
- `preact` → `../vendor/preact.mjs`
- `preact/hooks` → `../vendor/preact-hooks.mjs`
- `@preact/signals` → `../vendor/preact-signals.mjs`
- `@preact/signals-core` → `../vendor/signals-core.mjs`
- `livekit-client` → `../vendor/livekit-client.mjs`
- `nostr-tools` → `../vendor/nostr-tools.mjs`
- `xstate` → `../vendor/xstate.mjs`

**localStorage keys** (10 total):
- `nostr_pubkey`, `nostr_privkey` (deprecated; use `zn_sk`/`zn_pk`)
- `zn_sk`, `zn_pk` (Nostr keys: private key nsec, public key npub)
- `zn_servers`, `zn_joined_servers`, `zn_lastServer`, `zn_serverOrder`
- `zellous_rnnoise`, `zellous_forceRelay` (settings toggles)

**event listeners** (window/document level):
- `click` (4 instances) — modal/context menu dismissal
- `online` (2 instances) — network reconnection healing
- `visibilitychange` (2 instances) — app background/foreground
- `pageshow` (1 instance) — page restoration after back button
- `paste` (1 in module script) — clipboard media paste

**DOM references** (17 modules mutate via `getElementById`):
- Channel sidebar: `#channelList`, `#channelSidebar`, `#serverList`, `#serverIcons`, `#serverHeader`
- Voice: `#voiceGrid`, `#voiceView`, `#voiceControlsBar`, `#voiceMicBtn`, `#voiceDeafenBtn`, `#voiceCamBtn`, `#voiceLeaveBtn`
- Chat: `#chatArea`, `#chatMessages`, `#chatMessagesInner`, `#chatInput`, `#attachBtn`, `#sendBtn`
- User panel: `#userPanel`, `#userPanelName`, `#userPanelTag`, `#userPanelAvatar`
- Settings/auth: `#settingsPopover`, `#authModal`, `#settingsInputDevice`, `#settingsOutputDevice`
- Mobile: `#mobileHeader`, `#mobileMenuBtn`, `#mobileMembersBtn`, `#mobileTitle`
- Threads: `#threadPanel`, `#threadList`
- Members: `#memberList`
- File: `#fileInput`

### Script Loading Sequence

Bootstrap in `docs/nostr-chat/index.html` (module script):
1. Preact signals → `window.__signal`, `window.__computed`, `window.__effect`
2. `js/state.js` → `window.state`, `window.stateSignals`, `window.config`
3. `nostr-tools` → `window.NostrTools`
4. `xstate` → `window.XState`
5. `window.__appBase` = computed from `import.meta.url` → base path for all script loading
6. **47 classic scripts** loaded sequentially via `createElement('script')` + `head.appendChild()`
7. `effect()` wires signals to UI renders
8. `window.appReady = true`

### Embedding Strategy

**Global isolation**: Move all `window.X` → `window.__zellous.X` to prevent parent page collision.

**Import resolution**: `importmap` uses relative `../vendor/` paths — only works at `docs/nostr-chat/index.html` depth. For embedded iframe at different path, must compute `window.__appBase` dynamically (already done via `import.meta.url`). importmap itself still needs updating to use dynamic base.

**Frame restrictions**: GH Pages has no `X-Frame-Options` or `CSP frame-ancestors` headers blocking embedding.

**postMessage bridge**: Planned API for parent-to-iframe and iframe-to-parent communication (see `.prd` items 5, 8, 9).

**Responsive sizing**: App should work at 300px width and any height. Current design is intrinsically responsive (no `window.innerHeight` refs).

### Frame Requirements

- **Sandbox**: `<iframe sandbox="allow-scripts allow-same-origin">` recommended (adjust perms per use case)
- **CORS**: Static GH Pages allows all origins for reading (no issue)
- **CSP**: If parent has strict CSP, ensure `frame-src` allows iframe origin
- **Origin validation**: iframe should validate `message.origin` before processing incoming postMessages

### postMessage API

**Iframe exposes `window.__zellous.embed` object:**

```javascript
// Subscribe to events
window.__zellous.embed.on('ready', (data) => console.log('Iframe ready'));
window.__zellous.embed.on('user-joined', (data) => console.log('User:', data));

// Call methods (from parent)
iframe.contentWindow.postMessage({
  type: 'getState',
  id: 1
}, '*');

// Response arrives as
window.addEventListener('message', (e) => {
  if (e.data.type === 'response' && e.data.id === 1) {
    console.log('State:', e.data.result);
  }
});
```

**Available methods** (parent calls via postMessage):
- `getState()` — returns `{ user, channel, voiceConnected, isReady }`
- `joinRoom(roomId)` — connect to voice room
- `leaveRoom()` — disconnect voice
- `sendMessage(text, channelId)` — send chat message

**Events emitted** (iframe sends via postMessage):
- `ready` — iframe loaded and initialized
- `user-joined` — new peer joined voice
- `user-left` — peer left voice
- `message-sent` — chat message posted
- `error` — error occurred

**Message envelope**:
```json
{
  "type": "methodName | eventName",
  "version": 1,
  "data": { },
  "id": 123
}
```

**Error handling**:
```javascript
window.addEventListener('message', (e) => {
  if (e.data.type === 'error' && e.data.id === 123) {
    console.error('Error:', e.data.error);
  }
});
```

**Example: docs/embed.html** shows full working demo with controls and event log.

## Embedding Zellous (Complete Guide)

For a comprehensive embedding guide with examples, API reference, security notes, troubleshooting, and test harness, see **EMBEDDING.md**.

Quick reference:
- All globals namespaced under window.__zellous to prevent parent page collisions
- Backward compatibility: window.state, window.lk, window.ui still work
- CSS responsive: app height uses 100% (not 100vh), respects container size
- Test harness: docs/test-embed-harness.html covers 4+ embedding scenarios

## Flow UI — Modern, Content-First Redesign

`docs/flow.html` provides an alternative UI layout optimized for content visibility and voice chat.

### Entry Point
- `docs/flow.html` — modern layout with left sidebar, top command bar, voice grid
- `docs/js/ui-flow.js` — main controller binding DOM events and state updates
- `docs/css/flow.css` — layout and styling for Flow UI
- `docs/css/animations.css` — micro-animations with spring easing

### Enhancement Modules (docs/js/)
Flow UI is augmented with 10 optional enhancement modules, each <200 lines:

1. **cmd-palette.js** — Command palette with fuzzy search
   - Searches channels, users, servers, threads by prefix
   - Fuzzy matching: `cmd` matches `CommandPalette`, `gen` matches `general`
   - Caches recent commands in localStorage `zn_cmdRecent`
   - Execute dispatches to channel switch, DM open, server join

2. **cmd-palette-ui.js** — Command palette UI bindings
   - Ctrl+K to open, Escape to close
   - Arrow keys navigate results, Enter selects
   - Input focus auto-triggers search

3. **emoji-reactions.js** — First-class emoji reactions
   - Publishes kind-7 Nostr events on reaction toggle
   - Renders top 3 reactions inline with +N indicator
   - Distinguishes user-reacted vs other reactions via visual styling

4. **voice-quality.js** — WebRTC voice quality indicators
   - RTT thresholds: <100ms=good 🟢, <300ms=degraded 🟡, >300ms=poor 🔴
   - Updates per-participant quality tiles in voice grid
   - Shows footer quality indicator with RTT/status details
   - Popover displays full latency metrics on hover

5. **messaging.js** — Markdown parsing and syntax highlighting
   - Parses **bold**, *italic*, `code`, ```fenced blocks```
   - syntaxHighlight module with language detection (js, py, rust, go)
   - messageThreading groups consecutive same-author messages (7-minute window)
   - XSS-safe escapeHtml prevents injection

6. **keyboard-nav.js** — Keyboard navigation and a11y
   - Focus trap in modals (Tab loops within modal)
   - Skip link for jump-to-main-content
   - Aria labels for buttons, regions, listboxes
   - Focus-visible outline with 2px accent color
   - Screen reader announcement region for status updates

7. **theme-manager.js** — Theme and accent customization
   - Themes: light, dark, auto (follows system preference)
   - Accent presets: indigo, violet, pink, cyan, green, orange
   - CSS variable swapping (--bg-base, --bg-surface, --text-primary, --accent)
   - localStorage persistence (zn_theme, zn_accent)

8. **sidebar-manager.js** — Collapsible sidebar
   - Toggle between 240px (expanded) and 64px (icon-only) widths
   - Hover-expand: sidebar expands on hover when collapsed
   - localStorage persistence (zn_sidebarCollapsed)
   - Smooth CSS transitions

9. **relay-status.js** — Relay connection indicator
   - Topbar indicator: green dot (all relays connected), yellow (<50%), red (0)
   - Polls window.__debugNet every 2s for relay health
   - Popover shows per-relay latency and connection status
   - Warning banner if zero relays connected

10. **debug-structure.js** — Observability registry
    - window.__debug permanent structure (not console.log)
    - 8 subsystems: ui, voice, relay, cache, user, errors, perf
    - Real-time updates: active channel, voice FSM state, RTT matrix, peer list
    - Errors tracked (max 20 entries) with timestamp and context

### Animations
- fadeIn (200ms) — message entrance
- slideInRight (150ms) — new participant tile
- pulse (2s infinite) — unread indicator
- buttonPress (100ms) — button click feedback
- Spring easing: cubic-bezier(0.34, 1.56, 0.64, 1) for smooth feel
- @media (prefers-reduced-motion) respects user accessibility preferences

### Module Loading
Flow UI loads enhancement modules in sequence in `docs/flow.html`:
```javascript
const enhancements = [
  'js/cmd-palette.js',
  'js/cmd-palette-ui.js',
  'js/emoji-reactions.js',
  'js/voice-quality.js',
  'js/messaging.js',
  'js/keyboard-nav.js',
  'js/theme-manager.js',
  'js/sidebar-manager.js',
  'js/relay-status.js',
  'js/debug-structure.js'
];

for (const mod of enhancements) {
  try {
    await import(base + mod);
  } catch (e) {
    console.warn('Failed to load enhancement:', mod, e.message);
  }
}
```

All modules register into window.__zellous namespace to prevent parent page collisions.

### localStorage Keys Added
- `zn_cmdRecent` — recent command palette queries
- `zn_theme` — theme preference (light/dark/auto)
- `zn_accent` — accent color preset
- `zn_sidebarCollapsed` — sidebar collapsed state
