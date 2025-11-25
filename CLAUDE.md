# Zellous - Technical Reference

## Architecture Overview

### Server Modules (server/)
- `storage.js` - Filesystem-based persistence for users, sessions, rooms, messages, media, files
- `auth.js` - Authentication middleware, user management, multi-device support
- `bot-api.js` - Bot connectivity API (REST + simplified WebSocket)

### Client Modules (js/)
- `state.js` (45L) - Config, state object, room URL parsing
- `auth.js` (140L) - Login persistence, session management, device tracking
- `ui.js` (270L) - DOM references, render functions, UI actions
- `chat.js` (120L) - Text messaging, image preview, file attachments
- `files.js` (110L) - File upload/download, drag-drop, clipboard paste
- `audio.js` (117L) - Opus encoding/decoding, playback, pause/resume
- `queue.js` (95L) - Audio segment queue, replay, download
- `network.js` (180L) - WebSocket, message handlers
- `ptt.js` (89L) - PTT, deafen, VAD
- `webcam.js` (67L) - Webcam capture/playback

### OS.js Integration (osjs/)
- `main.js` - OS.js application wrapper (iframe-based)
- `main.css` - Application styling
- `metadata.json` - Package metadata

## Data Directory Structure

```
data/
  users/                    # User accounts
    {userId}.json          # User profile & auth
    _index.json            # Username -> userId mapping
  sessions/                 # Active sessions
    {sessionId}.json       # Session data with devices
  rooms/                    # Room data & artifacts
    {roomId}/
      meta.json            # Room metadata
      messages/            # Text messages band
        {timestamp}-{id}.json
      media/               # Media band (audio/video chunks)
        {timestamp}-{userId}/
          meta.json
          audio.opus
          video.webm
      files/               # Files band (user uploads)
        images/            # Auto-organized images
        {customPath}/      # User-defined structure
  bots/                    # Bot configurations
    {botId}.json
  cleanup.json             # Tracks rooms for 10-min cleanup
```

## Message Protocol

### Client -> Server
```javascript
{ type: 'join_room', roomId }
{ type: 'authenticate', token }
{ type: 'audio_start' }
{ type: 'audio_chunk', data: Uint8Array }
{ type: 'audio_end' }
{ type: 'video_chunk', data: Uint8Array }
{ type: 'text_message', content }
{ type: 'image_message', filename, data: base64, caption }
{ type: 'file_upload_complete', filename, data: base64, path, description }
{ type: 'set_username', username }
{ type: 'get_messages', limit, before }
{ type: 'get_files', path }
```

### Server -> Client
```javascript
{ type: 'connection_established', clientId, user }
{ type: 'auth_success', user }
{ type: 'auth_failed', error }
{ type: 'room_joined', roomId, currentUsers }
{ type: 'speaker_joined', userId, user }
{ type: 'speaker_left', userId, user }
{ type: 'audio_data', userId, data }
{ type: 'video_chunk', userId, data }
{ type: 'text_message', id, userId, username, content, timestamp }
{ type: 'image_message', id, userId, username, content, metadata, timestamp }
{ type: 'file_shared', id, userId, username, content, metadata, timestamp }
{ type: 'message_history', messages }
{ type: 'file_list', files, path }
{ type: 'user_joined', user, userId }
{ type: 'user_left', userId }
```

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
- `GET /api/rooms/:roomId/files` - List files
- `GET /api/rooms/:roomId/files/:fileId` - Download file

### Bot API
- `POST /api/bots` - Create bot (user auth required)
- `GET /api/bots` - List user's bots
- `GET /api/bots/:botId` - Get bot info (bot auth)
- `PATCH /api/bots/:botId` - Update bot
- `DELETE /api/bots/:botId` - Delete bot
- `POST /api/bots/:botId/regenerate-key` - Regenerate API key
- `POST /api/rooms/:roomId/messages` - Bot send message
- `POST /api/rooms/:roomId/files` - Bot upload file

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
{ type: 'text', userId, username, content, timestamp }
{ type: 'audio_start', userId, username }
{ type: 'audio_chunk', userId, data }
{ type: 'audio_end', userId }
{ type: 'file', userId, username, filename, fileId, size }
{ type: 'error', error }
```

## Session Storage & Cleanup

- Sessions stored in filesystem (not RAM) at `data/sessions/`
- Room data persists for 10 minutes after last user leaves
- Cleanup scheduled in `data/cleanup.json`
- On server restart, all scheduled cleanups are processed
- Expired sessions automatically deleted

## Audio Pipeline
- Codec: Opus via WebCodecs API (24kbps, 48kHz, mono)
- Chunk size: 4096 samples (~85ms)
- Binary transport: msgpackr

## State Properties
isSpeaking, audioContext, mediaStream, scriptProcessor, audioBuffers, audioSources,
playbackState, pausedAudioBuffer, pausedBuffers, masterVolume, activeSpeakers, messages,
audioHistory, recordingAudio, audioEncoder, audioDecoders, scheduledPlaybackTime, ws,
userId, roomId, audioQueue, activeSegments, currentSegmentId, replayingSegmentId,
replayGainNode, replayTimeout, skipLiveAudio, currentLiveSpeaker, isDeafened, nextSegmentId,
ownAudioChunks, vadEnabled, vadThreshold, vadSilenceDelay, vadSilenceTimer, vadAnalyser,
webcamEnabled, webcamStream, webcamRecorder, webcamResolution, webcamFps, ownVideoChunks,
incomingVideoChunks, liveVideoChunks, liveVideoInterval, inputDeviceId, outputDeviceId,
chatMessages, chatInputValue, isAuthenticated, currentUser, currentFilePath, fileList,
activePanel, showAuthModal, showSettingsModal

## Debug Console
```javascript
window.zellousDebug
window.state
window.ui
window.audio
window.queue
window.network
window.ptt
window.deafen
window.vad
window.webcam
window.auth
window.chat
window.fileTransfer
```

## Features
- PTT with recording indicator
- VAD with threshold control
- Audio queue with sequential playback
- Replay/download audio segments as WAV
- WebM video streaming with VP9/VP8
- Device selection (mic/speaker)
- Volume control
- Deafen mode
- Room isolation via URL param (?room=name)
- Mobile-responsive with hamburger menu
- **User authentication with login persistence**
- **Multi-device support with device management**
- **Text messaging with image display**
- **File transfers with custom folder structure**
- **Bot/client connectivity API**
- **10-minute session storage after room empty**
- **OS.js desktop integration**

## Dependencies
- express, ws, msgpackr, cors (server)
- msgpackr.min.js (client, bundled)

## Deploy
```bash
npm install && npm start
```

## OS.js Integration
```bash
cd osjs
npm install
npm run build
# Copy dist/ to OS.js packages directory
```
