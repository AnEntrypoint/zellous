# Zellous - Technical Reference

## Architecture Overview

Zellous is a fully serverless voice and chat app using public Nostr relays. No backend required.

### Entry Point
- `docs/nostr-chat/index.html` — main app (GH Pages static site)
- Loads `js/state.js` from root via `../js/state.js` import
- Loads all other scripts from `docs/js/` via base URL resolution

### Client Modules (docs/js/)
- `ui.js` — DOM references, render functions, UI actions. `switchChannel` triggers `lk.connect()` on voice channel click; clicking active voice channel calls `lk.disconnect()`
- `ui-channels.js` — Channel list render. Shows spinner on `.voice-connecting` state, `.voice-active` on connected voice channel
- `ui-voice.js` — Voice grid render. No join overlay — grid renders immediately on channel switch
- `ui-chat.js` — Chat message rendering, emoji reactions
- `nostr-auth.js` — Nostr key management (nsec/npub), NIP-07 extension support
- `nostr-state-patch.js` — Patches state signals for nostr mode
- `nostr-network.js` — Nostr relay connection, event pub/sub
- `nostr-fsm.js` — Finite state machine for connection lifecycle
- `nostr-voice.js` — Serverless voice via native WebRTC + Nostr signaling; replaces `window.lk`
- `nostr-chat.js` — Chat over Nostr events
- `nostr-channels.js` — Channel management via Nostr
- `nostr-channels-ui.js` — Channel modals, context menus, drag-and-drop
- `nostr-servers.js` — Server (community) management via Nostr
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

### Nostr Voice (Serverless)
Voice uses native WebRTC mesh with Nostr kind 30078 events as signaling channel.

- `nostr-voice.js` — Sets `window.lk = nostrVoice` in nostr mode
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
