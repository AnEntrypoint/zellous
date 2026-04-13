# Global Surface Audit — Embedding Readiness

## Window Assignments (55 properties)

### Core State & Controls
- **window.state** (state.js:129) — Global state proxy with reactive signals
- **window.stateSignals** (state.js:130) — Raw signal object for voice/chat state
- **window.config** (state.js:131) — App configuration object
- **window.ui** (ui.js:120) — DOM refs and render dispatch
- **window.getInitial, getAvatarColor, escHtml, formatTime, chIcon** (ui.js:121-125) — Helper functions

### Voice Subsystem
- **window.lk** (nostr-voice.js:253) — Main voice interface (alias for nostrVoice)
- **window.nostrVoice** (nostr-voice.js:254) — Full voice session manager
- **window.nostrVoiceRtc** (nostr-voice-rtc.js:165) — WebRTC peer management
- **window.nostrVoiceSfu** (nostr-voice-sfu.js:127) — SFU hub election & forwarding
- **window.nostrVoiceCamera** (nostr-voice-camera.js:62) — Camera FSM and toggle

### Networking & Auth
- **window.nostrNet** (nostr-network.js:164) — Relay connection & pub/sub
- **window.network** (nostr-network.js:165) — Alias for nostrNet
- **window.auth** (nostr-auth.js:183) — Nostr key management (nsec/npub)
- **window.nostrBans** (nostr-bans.js:56) — Ban/timeout enforcement

### Managers
- **window.serverManager** (nostr-servers.js:222) — Server/community management
- **window.serverRoles** (nostr-roles.js:71) — Role-based access control
- **window.serverSettings** (nostr-settings.js:60) — Server configuration
- **window.serverPages** (nostr-pages.js:145) — Page-as-document feature
- **window.channelManager** (nostr-channels.js:144) — Channel management
- **window.chat** (nostr-chat.js:179) — Chat message interface
- **window.message** (nostr-message.js:11) — System message dispatcher
- **window.threadManager** (threads.js:113) — Threaded conversations

### UI Components
- **window.uiVoice** (ui-voice.js:162) — Voice grid render methods
- **window.uiMembers** (ui-voice.js:161) — Member list/grid UI
- **window.uiChat** (ui-chat.js:200) — Chat message rendering
- **window.uiChannels** (ui-channels.js:191) — Channel list rendering

### Media & Files
- **window.audio** (audio.js:131) — Opus encode/decode
- **window.webcam** (webcam.js:67) — Webcam capture interface
- **window.fileTransfer** (files.js:182) — File upload/download
- **window.ptt, deafen, vad** (ptt.js:102-104) — Voice activity detection
- **window.queue** (queue.js:95) — Audio replay queue
- **window.nostrMedia** (nostr-media.js:59) — Media event handling

### Utilities
- **window.icons, getIcon** (icons.js:33-34) — SVG icon registry
- **window.moderation** (moderation.js:151) — Member management actions
- **window.ZellousSDK** (nostr-adapter.js:195) — SDK instance export

### FSM Registry
- **window.nostrFsm** (nostr-fsm.js:4) — XState machines: voiceMachine, peerMachine, cameraMachine

## Observability Registries (Permanent Structures)

### Debug Surface
- **window.__debug.voice** — Voice FSM state, peers, SFU election, retry schedule
- **window.__debug.bans** — Active bans and timeouts by serverId
- **window.__debug.media** — Media event log
- **window.__debug.roles** — Role assignments per server
- **window.__debug.settings** — Server settings snapshots
- **window.__debug.pages** — Page history
- **window.__debugNet** — Relay latency stats (getter)

## localStorage Keys (Nostr Mode)

### Auth & Identity
- **zn_sk** — Nostr secret key (hex-encoded)
- **zn_pk** — Nostr public key

### Server/Channel Persistence
- **zn_servers** — Owned servers (JSON array)
- **zn_joined_servers** — Joined server list
- **zn_lastServer** — Last viewed server
- **zn_serverOrder** — Server sidebar order

### Settings
- **zellous_rnnoise** — Voice denoiser enabled (boolean)
- **zellous_forceRelay** — Force relay selection (string)

### NostrAdapter Keys
- **nostr_pubkey, nostr_privkey** — Alternative key storage

## Window Event Listeners (22 total)

### Network/Visibility Recovery (nostr-voice-rtc.js)
- **visibilitychange** (line 189) — Heal peers on tab visible
- **online** (line 193) — Heal peers on network restore
- **pageshow** (line 198) — Heal peers on bfcache restore

### UI Event Handlers (bound via onclick attributes or addEventListener)
- **click**: moderation (139), nostr-channels-ui (13), nostr-pages (4x), threads (2x), ui-channels (146), ui-chat (4x), ui-voice (2x)
- **mousedown**: nostr-pages (108)

## importmap Entries (../vendor/ hardcoded paths)

```json
{
  "htm": "../vendor/htm.js",
  "preact": "../vendor/preact.mjs",
  "preact/hooks": "../vendor/preact-hooks.mjs",
  "@preact/signals": "../vendor/preact-signals.mjs",
  "@preact/signals-core": "../vendor/signals-core.mjs",
  "livekit-client": "../vendor/livekit-client.mjs",
  "nostr-tools": "../vendor/nostr-tools.mjs",
  "xstate": "../vendor/xstate.mjs"
}
```

**Issue**: All paths are relative (`../vendor/...`). Breaks if index.html moves or embedding happens at different directory depth.

## XState v5 Setup

**Pattern**: Module script imports XState, assigns to window:
```javascript
import { createMachine, createActor } from 'xstate';
window.XState = { createMachine, createActor };
```

Classic scripts (nostr-fsm.js, nostr-voice.js, etc.) call:
```javascript
XState.createActor(nostrFsm.voiceMachine)
```

## Collision Risks (Parent Page Conflicts)

**High Risk**: Names too generic
- window.state — Parent page likely has this
- window.config — Common app config
- window.ui — Generic UI namespace

**Medium Risk**: Nostr-specific but likely in parent
- window.auth — Common auth object
- window.message — Common message bus
- window.chat — If parent is chat app

**Low Risk**: Zellous-specific prefixes
- window.nostrVoice, nostrNet, nostrBans — Unlikely collision

## Document Mutations

**No direct document.body.appendChild found at module level.** All mutations occur in event handlers or function calls:
- Context menus appended to body (moderation.js:85, ui-chat.js)
- Video elements appended to voice tile wrappers (nostr-voice-rtc.js)
- Modal creation via ui.js

**No frame restrictions detected** (no X-Frame-Options, no CSP frame-ancestors in static HTML).

## Removal Strategy (On Disconnect)

For embedding to work, cleanly unload all globals:
1. Cancel all active listeners (presence heartbeats, relay subscriptions)
2. Close all WebRTC peer connections
3. Stop all timers (retry schedules, presence updates)
4. Delete all window.* assignments
5. Clear localStorage keys prefixed `zn_` and `zellous_`

**Currently Missing**: No cleanup lifecycle. Need explicit `disconnect()` or similar at embed boundary.

## Next Steps

To enable embedding, address:
1. **Namespace everything under window.__zellous** — prevent parent collision
2. **Make importmap paths dynamic** — compute base from script location
3. **Add cleanup function** — clear state, unsubscribe, stop timers on unload
4. **Test with multiple iframes** — verify state isolation
