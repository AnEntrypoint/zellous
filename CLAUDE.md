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
