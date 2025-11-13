# Zellous - Browser PTT Communication

A production-ready Push-to-Talk application with Opus codec, dynamic rooms, audio replay, and real-time multi-user support.

## Quick Start

```bash
npm install
npm start
# Visit http://localhost:3000
```

**Development with hot reload:**
```bash
npm run dev
```

**Join a specific room:**
```
http://localhost:3000?room=meeting
http://localhost:3000?room=team1
```

## Features

- **Push-to-Talk**: Hold button to record and transmit
- **Opus Codec**: 24kbps bitrate, 93.75% bandwidth reduction
- **Dynamic Rooms**: URL-based rooms with complete isolation
- **Audio Replay**: Replay last 50 messages with audio
- **Live Playback**: Stream audio in real-time from other speakers
- **Auto Pause/Resume**: Playback automatically pauses when you talk
- **Active Speakers**: Real-time display of who's speaking
- **Message History**: Timestamped communication log with replay buttons
- **Multi-user**: Supports simultaneous speakers per room
- **Volume Control**: Master volume slider (0-100%)
- **Hot Reload**: Nodemon for development
- **Responsive**: Desktop and mobile friendly

## Architecture

Zellous uses a modular, scalable design:

### Frontend (app.js - 373 lines)

**Modules:**
- `config` - Constants
- `state` - Centralized state object (18 properties including roomId)
- `audio` - Opus encoding/decoding/playback/replay
- `message` - Message routing (7 message types)
- `network` - WebSocket communication with room injection
- `audioIO` - Microphone/recording
- `ptt` - Push-to-talk logic
- `ui_*` - UI rendering and events

### Backend (server.js - 93 lines)

**Handler pattern:**
```javascript
handlers = {
  join_room: (client, msg) => { /* ... */ },
  audio_start: (client) => { /* ... */ },
  audio_chunk: (client, msg) => { /* ... */ },
  audio_end: (client) => { /* ... */ },
  set_username: (client, msg) => { /* ... */ }
}
```

**Room-filtered broadcast** efficiently distributes messages only to clients in the same room.

### HTML (index.html - 68 lines)

Semantic HTML with inline CSS. No external dependencies.

## State Management

Single centralized `state` object contains:
- Audio context, microphone stream
- Opus encoder/decoders per user
- Audio buffers and sources per user
- Active speakers set
- Message history array (50 messages)
- Audio history for replay
- WebSocket connection
- User ID, room ID, speaking state

Benefits:
- Predictable data flow
- Easy debugging
- Simple reset capability
- Clear dependencies

## Message Protocol

### Client → Server

```javascript
{ type: 'join_room', roomId: 'lobby' }     // Join a room
{ type: 'audio_start' }                    // User started talking
{ type: 'audio_chunk', data: [...] }       // Audio data (Opus)
{ type: 'audio_end' }                      // User stopped talking
{ type: 'set_username', username: 'name' } // Update username
```

### Server → Client

```javascript
{ type: 'room_joined', roomId, currentUsers }     // Room join confirmed
{ type: 'speaker_joined', user, userId }          // User started talking
{ type: 'speaker_left', userId, user }            // User stopped talking
{ type: 'audio_data', userId, data }              // Audio chunk
{ type: 'user_joined', user, userId }             // User connected
{ type: 'user_left', userId }                     // User disconnected
{ type: 'connection_established', clientId }      // Connection confirmed
```

## Audio Features

- **48kHz sample rate** for quality
- **Opus codec** at 24kbps bitrate
- **WebCodecs API** for native encoding/decoding
- **93.75% bandwidth reduction** (384kbps → 24kbps)
- **4096 sample chunks** for low latency
- **100ms playback intervals** for smooth audio
- **Per-user AudioDecoder** for concurrent playback
- **Audio replay** for last 50 messages

## Extending Zellous

### Add a Message Type

**Server (server.js):**
```javascript
handlers.my_message = (client, msg) => {
  broadcast({ type: 'my_response', data: msg.data });
}
```

**Client (app.js):**
```javascript
message.handlers.my_response = (msg) => {
  // Handle response
}
```

### Add a UI Control

1. Add element to HTML
2. Add reference to `ui` object
3. Create render function in `ui_render`
4. Bind events in `ui_events.setup()`

### Add Audio Effects

Add methods to `audio` module and call from playback loop.

### Rooms Already Implemented!

Dynamic rooms work via URL query parameters:
```
http://localhost:3000?room=team1
http://localhost:3000?room=meeting
```
Complete isolation between rooms with zero configuration required.

## Debug Console

Access all internals via `window.zellousDebug`:

```javascript
window.zellousDebug.state       // Full application state
window.zellousDebug.audio       // Audio functions
window.zellousDebug.message     // Message handlers
window.zellousDebug.network     // Network functions
window.zellousDebug.ptt         // PTT controls
window.zellousDebug.config      // Configuration
```

## Performance

- **Minimal dependencies**: Express, WebSocket only
- **Event-driven**: No polling
- **Audio buffering**: Prevents stuttering
- **Opus codec**: 93.75% bandwidth savings
- **Map-based storage**: O(1) client lookups
- **Room filtering**: O(1) per-client comparison

## Browser Support

**Full Support (WebCodecs API):**
- Chrome/Chromium 94+ (Opus encoder/decoder)
- Edge 94+ (Opus encoder/decoder)
- Opera 80+ (Opus encoder/decoder)

**Partial Support:**
- Safari Technology Preview (AudioDecoder only)

**Requirements:**
- Web Audio API
- WebCodecs API (AudioEncoder, AudioDecoder)
- MediaDevices API

## Production Considerations

**Already Implemented:**
- ✅ Multiple rooms/channels (URL-based, zero config)
- ✅ Hot reload for development
- ✅ Audio replay functionality

**Ready for:**
- User authentication (add to message handlers)
- Encryption (wrap network.send)
- Database integration (replace broadcast)
- Clustering (use Redis, socket.io)
- Recording (add to audio.play callback)

See [CLAUDE.md](CLAUDE.md) for detailed technical documentation.

## Files

```
server.js         - Express + WebSocket server (93 lines)
app.js            - Frontend application (373 lines)
index.html        - UI markup and styles (68 lines)
package.json      - Dependencies (express, ws, nodemon)
nodemon.json      - Hot reload configuration (5 lines)
README.md         - Quick start and features
CLAUDE.md         - Technical reference
CHANGELOG.md      - Version history
```

## License

MIT
