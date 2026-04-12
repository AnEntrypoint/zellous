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
- `nostr-fsm.js` — Finite state machine factory (`makeFSM`) for connection lifecycle
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
