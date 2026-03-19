# Zellous - Technical Reference

## Architecture Overview

### Storage Layer
- `server/db.js` — Re-export shim; all implementation is in `server/db/`. Same public surface: `initialize, startCleanup, stopCleanup, users, sessions, rooms, messages, media, files, servers, bots` and utilities.
- `server/db/index.js` — Wires together domain modules via a shared `ctx` object (db getter, config getter, dataRoot getter, row/rows helpers).
- `server/db/users.js` — User CRUD, authentication, device management.
- `server/db/sessions.js` — Session lifecycle, validation, expiry cleanup.
- `server/db/rooms.js` — Room metadata, channels, categories, cleanup scheduling.
- `server/db/messages.js` — Message save/get/edit/remove (filesystem JSON files).
- `server/db/media.js` — Audio/video chunk recording sessions.
- `server/db/files.js` — File storage, metadata, recursive lookup.
- `server/db/servers.js` — Server CRUD, membership, roles.
- `server/db/bots.js` — Bot CRUD, API key management.
- `server/db/utils.js` — Shared crypto utilities: `generateId, shortId, hashPassword, verifyPassword, generateApiKey, hashApiKey, tryParse`.
- Storage auto-selects embedded mode (in-process LanceDB) when no `BUSYBASE_URL` is set, or HTTP mode when it is set.

### Column Name Constraint
All data stored in vectordb/LanceDB uses all-lowercase column names (`userid`, `ownerid`, `displayname`, etc.) because LanceDB SQL parser normalizes unquoted identifiers to lowercase. The db modules map between lowercase storage keys and camelCase public API. Breaking this pattern causes silent filter failures.

### Server Modules (server/)
- `config.js` — `createConfig(overrides)` merging env vars with defaults. Single source of truth for all config. Used by `server.js` — no direct `process.env` reads in server.js.
- `auth-ops.js` — All auth operations: register, login, logout, session management, password change, WS auth
- `bot-middleware.js` — Bot API key authentication middleware
- `utils.js` — `responses` (HTTP response helpers) and `validators` (input validation)
- `handlers.js` — Handler registry (registerHandler/getHandler). All built-in WS handlers are registered here at startup; external plugins use the same registry.
- `ws-handler.js` — WebSocket connection lifecycle. All handlers (built-in and plugins) dispatched via single `getHandler(msg.type)` lookup.
- `bot-handlers.js` — Bot WebSocket message handlers
- `bot-websocket.js` — BotConnection class
- `livekit.js` — LiveKit binary management, config, ICE servers
- `routes-auth.js` — Express Router for `/api/auth/*` and `/api/user/*`
- `routes-rooms.js` — Express Router for `/api/rooms/*` (user-facing)
- `routes-servers.js` — Express Router for `/api/servers/*`
- `routes-bots.js` — Bot CRUD (`makeBotsRouter`) and bot room access (`makeBotRoomsRouter`)
- `routes-livekit.js` — LiveKit HTTP proxy, WS proxy, token endpoint

### Client SDK (lib/)
- `zellous-core.js` — `ZellousCore` EventEmitter class: client/room/broadcast management
- `room-manager.js` — Pure room join/leave/query functions used by ZellousCore
- `default-handlers.js` — Composes auth + room + media + messaging handlers
- `handlers-media.js` — Audio/video stream handlers
- `handlers-messaging.js` — Text/file/image message handlers
- `index.js` — Package entry: `ZellousCore`, `createDefaultHandlers`, `createZellousInstance`

### Client Modules (js/)
- `state.js` — Config, state object, room URL parsing
- `auth.js` — Login persistence, session management, device tracking
- `api.js` — Shared `apiRequest(method, url, body)` fetch helper (reads auth token at call time)
- `channels-api.js` — Channel/category API calls using `apiRequest`; exposes `window.channelApi`
- `channels-ui.js` — Channel/category modals, context menus, drag-and-drop; exposes `window.channelManager`
- `ui.js` — DOM references, render functions, UI actions
- `chat.js` — Text messaging, image preview, file attachments
- `files.js` — File upload/download, drag-drop, clipboard paste
- `audio.js` — Opus encoding/decoding, playback, pause/resume
- `queue.js` — Audio segment queue, replay, download
- `network.js` — WebSocket, message handlers
- `nostr-voice.js` — Serverless voice via VDO.Ninja iframe + Nostr presence signaling; replaces `window.lk` in nostr mode
- `ptt.js` — PTT, deafen, VAD
- `webcam.js` — Webcam capture/playback

## Package Exports
```
'@sequentialos/zellous'            → lib/index.js
'@sequentialos/zellous/core'       → lib/zellous-core.js
'@sequentialos/zellous/handlers'   → lib/default-handlers.js
'@sequentialos/zellous/handlers/media'     → lib/handlers-media.js
'@sequentialos/zellous/handlers/messaging' → lib/handlers-messaging.js
'@sequentialos/zellous/server'     → server.js
'@sequentialos/zellous/db'         → server/db.js
'@sequentialos/zellous/auth'       → server/auth-ops.js
'@sequentialos/zellous/config'     → server/config.js
```

## Configuration (Environment Variables)
- `PORT` — HTTP server port (default: 3000)
- `HOST` — Bind address (default: 0.0.0.0)
- `DATA_DIR` — Data directory (default: ./data)
- `BUSYBASE_URL` — If set, use remote busybase HTTP mode; otherwise use embedded LanceDB
- `BUSYBASE_KEY` — API key for remote busybase (default: local)
- `PING_INTERVAL` — WebSocket ping interval ms (default: 30000)
- `SESSION_TTL` — Session lifetime ms (default: 7 days)
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — External LiveKit; if absent, auto-downloads livekit-server binary
- `LIVEKIT_TURN_URL`, `LIVEKIT_TURN_USERNAME`, `LIVEKIT_TURN_CREDENTIAL` — TURN server config

## REST API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login (returns session token)
- `POST /api/auth/logout` - Logout current session
- `POST /api/auth/logout-all` - Logout all devices

### User
- `GET /api/user` - Get current user info
- `PATCH /api/user` - Update display name/settings
- `POST /api/user/change-password` - Change password

### Sessions & Devices
- `GET /api/sessions` - List active sessions
- `GET /api/devices` - List registered devices
- `DELETE /api/devices/:deviceId` - Remove device

### Rooms
- `GET /api/rooms` - List active rooms
- `GET /api/rooms/:roomId` - Get room info & users
- `GET /api/rooms/:roomId/messages` - Get message history
- `DELETE /api/rooms/:roomId/messages/:messageId` - Delete message
- `PATCH /api/rooms/:roomId/messages/:messageId` - Edit message
- `GET /api/rooms/:roomId/files` - List files
- `GET /api/rooms/:roomId/files/:fileId` - Download file
- `GET/POST/PATCH/DELETE /api/rooms/:roomId/channels` - Channel CRUD
- `POST /api/rooms/:roomId/channels/reorder` - Reorder channels
- `GET/POST/PATCH/DELETE /api/rooms/:roomId/categories` - Category CRUD
- `POST /api/rooms/:roomId/categories/reorder` - Reorder categories

### Servers
- `POST /api/servers` - Create server
- `GET /api/servers` - List servers
- `GET /api/servers/:serverId` - Get server
- `PATCH /api/servers/:serverId` - Update server
- `DELETE /api/servers/:serverId` - Delete server
- `POST /api/servers/:serverId/join` - Join server
- `POST /api/servers/:serverId/leave` - Leave server
- `POST /api/servers/:serverId/kick/:userId` - Kick user
- `POST /api/servers/:serverId/ban/:userId` - Ban user
- `PATCH /api/servers/:serverId/roles/:userId` - Set role

### Bot API (requires `Authorization: Bot <key>`)
- `POST /api/bots` - Create bot (user auth required)
- `GET /api/bots` - List user's bots
- `GET /api/bots/:botId` - Get bot info
- `PATCH /api/bots/:botId` - Update bot
- `DELETE /api/bots/:botId` - Delete bot
- `POST /api/bots/:botId/regenerate-key` - Regenerate API key
- `POST /api/rooms/:roomId/messages` - Bot send message
- `GET /api/rooms/:roomId/messages` - Bot get messages
- `POST /api/rooms/:roomId/files` - Bot upload file
- `GET /api/rooms/:roomId/files` - Bot list files
- `GET /api/rooms/:roomId/files/:fileId` - Bot download file

### LiveKit
- `GET /api/livekit/token?channel=&identity=` - Get voice token
- `/livekit/*` - HTTP proxy to local livekit-server
- `ws://.../livekit/*` - WebSocket proxy to local livekit-server

## WebSocket Message Protocol

### Client -> Server
```javascript
{ type: 'join_room', roomId }
{ type: 'authenticate', token }
{ type: 'audio_start' }
{ type: 'audio_chunk', data: Uint8Array }
{ type: 'audio_end' }
{ type: 'video_chunk', data: Uint8Array }
{ type: 'text_message', content, channelId }
{ type: 'image_message', filename, data: base64, caption, channelId }
{ type: 'file_upload_start', filename, size, uploadId }
{ type: 'file_upload_complete', filename, data: base64, path, description, channelId }
{ type: 'set_username', username }
{ type: 'edit_message', messageId, content }
{ type: 'get_messages', limit, before, channelId }
{ type: 'get_files', path }
```

### Server -> Client
```javascript
{ type: 'connection_established', clientId, user }
{ type: 'auth_success', user }
{ type: 'auth_failed', error }
{ type: 'room_joined', roomId, channels, categories, currentUsers }
{ type: 'user_joined', user, userId, isBot, isAuthenticated }
{ type: 'user_left', userId }
{ type: 'speaker_joined', userId, user }
{ type: 'speaker_left', userId, user }
{ type: 'audio_data', userId, data }
{ type: 'video_chunk', userId, data }
{ type: 'text_message', id, userId, username, content, timestamp }
{ type: 'image_message', id, userId, username, content, metadata, timestamp }
{ type: 'file_shared', id, userId, username, content, metadata, timestamp }
{ type: 'message_history', messages, channelId }
{ type: 'file_list', files, path }
{ type: 'message_updated', messageId, content, edited, editedAt }
{ type: 'message_deleted', messageId }
{ type: 'channel_created/updated/deleted', channel/channelId }
{ type: 'channels_reordered', channels }
{ type: 'category_created/updated/deleted', category/categoryId }
{ type: 'user_kicked/banned', userId, serverId }
```

## Bot WebSocket Protocol

Connect to: `ws://server/api/bot/ws`

### Bot -> Server
```javascript
{ type: 'auth', apiKey: 'zb_...' }
{ type: 'join', roomId }
{ type: 'leave' }
{ type: 'text', content }
{ type: 'audio_start' }
{ type: 'audio_chunk', data }
{ type: 'audio_end' }
{ type: 'file', filename, data }
```

### Server -> Bot
```javascript
{ type: 'auth_success', botId, name }
{ type: 'auth_error', error }
{ type: 'joined', roomId, users }
{ type: 'error', error }
```

## Audio Pipeline
- Codec: Opus via WebCodecs API (24kbps, 48kHz, mono)
- Chunk size: 4096 samples (~85ms)
- Binary transport: msgpackr

## Nostr Mode
Serverless alternative transport using public Nostr relays. Files: `js/nostr-adapter.js`, `rooms-ui/nostr-chat/index.html`.

### Nostr Voice (Serverless)
Voice in serverless mode uses VDO.Ninja (vdo.ninja) for peer-to-peer WebRTC audio and Nostr events for presence signaling. No server required.

- `js/nostr-voice.js` — Replaces the LiveKit `lk` object (`window.lk = nostrVoice`) in nostr mode
- Media transport: VDO.Ninja hidden iframe with `&room=ID&push&audioonly&api=KEY&cleanoutput`
- Room IDs: SHA-256 hash of `serverId:voice:channelName`, prefixed with `zellous`, truncated to 16 hex chars
- Presence: Nostr kind 30078 events with `d` tag `zellous-voice:<roomId>`, 30s heartbeat, 90s expiry
- Controls: iframe postMessage API — `{action:"mute"}`, `{action:"unmute"}`, `{action:"speaker",value:bool}`
- VDO.Ninja sends back `guest-connected`/`guest-disconnected` events via postMessage
- Interface matches `lk.*` API: `connect(channelName)`, `disconnect()`, `toggleMic()`, `toggleDeafen()`, `toggleCamera()`, `updateParticipants()`, `isDataChannelReady()`

## Dependencies
- express, ws, msgpackr, cors (server)
- busybase (storage — local embedded or remote HTTP)
- livekit-server-sdk (voice rooms)
- msgpackr.min.js (client, bundled)

## Deploy
```bash
npm install && npm start
```
