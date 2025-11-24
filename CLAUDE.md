# Zellous - Technical Reference

## Architecture

### Files (8 modules, 598 lines total)
- `js/state.js` (19L) - Config, state object, room URL parsing
- `js/ui.js` (65L) - DOM references, render functions, setStatus
- `js/audio.js` (117L) - Opus encoding/decoding, playback, pause/resume
- `js/queue.js` (95L) - Audio segment queue, replay, download
- `js/network.js` (70L) - WebSocket, message handlers
- `js/ptt.js` (89L) - PTT, deafen, VAD
- `js/webcam.js` (67L) - Webcam capture/playback
- `app.js` (76L) - AudioIO, events, init
- `server.js` (97L) - Express + WebSocket server
- `index.html` (291L) - UI markup + mobile nav

### Message Protocol
Client → Server: join_room, audio_start, audio_chunk, video_chunk, audio_end, set_username
Server → Client: room_joined, speaker_joined, speaker_left, audio_data, video_chunk, user_joined, user_left, connection_established

### Audio Pipeline
- Codec: Opus via WebCodecs API (24kbps, 48kHz, mono)
- Chunk size: 4096 samples (~85ms)
- Binary transport: msgpackr

### State Properties
isSpeaking, audioContext, mediaStream, scriptProcessor, audioBuffers, audioSources, playbackState, pausedAudioBuffer, pausedBuffers, masterVolume, activeSpeakers, messages, audioHistory, recordingAudio, audioEncoder, audioDecoders, scheduledPlaybackTime, ws, userId, roomId, audioQueue, activeSegments, currentSegmentId, replayingSegmentId, replayGainNode, replayTimeout, skipLiveAudio, currentLiveSpeaker, isDeafened, nextSegmentId, ownAudioChunks, vadEnabled, vadThreshold, vadSilenceDelay, vadSilenceTimer, vadAnalyser, webcamEnabled, webcamStream, webcamRecorder, webcamResolution, webcamFps, ownVideoChunks, incomingVideoChunks, liveVideoChunks, liveVideoInterval, inputDeviceId, outputDeviceId

### Debug Console
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
```

### Features
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

### Dependencies
- express, ws, msgpackr (server)
- msgpackr.min.js (client, bundled)

### Deploy
```bash
npm install && npm start
```
