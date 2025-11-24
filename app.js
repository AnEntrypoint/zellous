const CHUNK_SIZE = 4096;
const SAMPLE_RATE = 48000;

const config = { chunkSize: CHUNK_SIZE, sampleRate: SAMPLE_RATE };

const getRoomFromURL = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('room') || 'lobby';
};

const state = {
  isSpeaking: false,
  audioContext: null,
  mediaStream: null,
  scriptProcessor: null,
  audioBuffers: new Map(),
  audioSources: new Map(),
  playbackState: new Map(),
  pausedAudioBuffer: null,
  pausedBuffers: null,         // Map of userId -> paused audio buffers during PTT
  masterVolume: 0.7,
  activeSpeakers: new Set(),
  messages: [],
  audioHistory: new Map(),
  recordingAudio: new Map(),
  audioEncoder: null,
  audioDecoders: new Map(),
  scheduledPlaybackTime: new Map(),
  ws: null,
  userId: null,
  roomId: getRoomFromURL(),
  // Queue system
  audioQueue: [],              // Array of segment objects {id, userId, username, timestamp, status, chunks, decodedSamples, isOwnAudio}
  activeSegments: new Map(),   // userId -> current segment being recorded
  currentSegmentId: null,      // ID of currently playing segment
  replayingSegmentId: null,    // ID of segment currently being replayed
  isDeafened: false,           // Deafen mode toggle
  nextSegmentId: 1,            // Counter for unique segment IDs
  ownAudioChunks: [],          // Temporary storage for own audio chunks while recording
  // VAD (Voice Activity Detection)
  vadEnabled: false,           // Voice activation mode
  vadThreshold: 0.15,          // Sensitivity threshold (0-1)
  vadSilenceDelay: 1500,       // ms of silence before stopping (longer to avoid cutting between words)
  vadSilenceTimer: null,       // Timer for silence detection
  vadAnalyser: null,           // Audio analyser node for VAD
  // Webcam
  webcamEnabled: false,        // Webcam toggle
  webcamStream: null,          // MediaStream for webcam
  webcamRecorder: null,        // MediaRecorder for MP4 capture
  webcamResolution: '320x240', // Resolution setting
  webcamFps: 15,               // Framerate setting
  ownVideoChunks: [],          // Temporary storage for own video chunks
  incomingVideoChunks: null,   // Map of userId -> video chunks for streaming
  mediaSource: null            // Map of userId -> MediaSource for streaming
};

const ui = {
  ptt: document.getElementById('pttBtn'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  recordingIndicator: document.getElementById('recording'),
  connectionStatus: document.getElementById('status'),
  volumeSlider: document.getElementById('volume'),
  volumeValue: document.getElementById('volValue'),
  speakers: document.getElementById('speakers'),
  messages: document.getElementById('messages'),
  roomName: document.getElementById('roomName'),
  audioQueueView: document.getElementById('audioQueueView'),
  deafenBtn: document.getElementById('deafenBtn'),
  vadBtn: document.getElementById('vadBtn'),
  vadControls: document.getElementById('vadControls'),
  vadThreshold: document.getElementById('vadThreshold'),
  vadValue: document.getElementById('vadValue'),
  vadMeterContainer: document.getElementById('vadMeterContainer'),
  vadMeter: document.getElementById('vadMeter'),
  vadThresholdMarker: document.getElementById('vadThresholdMarker'),
  webcamBtn: document.getElementById('webcamBtn'),
  webcamPreview: document.getElementById('webcamPreview'),
  webcamVideo: document.getElementById('webcamVideo'),
  webcamResolution: document.getElementById('webcamResolution'),
  webcamFps: document.getElementById('webcamFps'),
  videoPlayback: document.getElementById('videoPlayback'),
  videoPlaybackVideo: document.getElementById('videoPlaybackVideo'),
  videoPlaybackLabel: document.getElementById('videoPlaybackLabel')
};

const audio = {
  initEncoder: () => {
    state.audioEncoder = new AudioEncoder({
      output: (chunk, metadata) => {
        const buffer = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buffer);
        state.ownAudioChunks.push(new Uint8Array(buffer));
        network.send({ type: 'audio_chunk', data: buffer });
      },
      error: (e) => console.error('Encoder error:', e)
    });
    state.audioEncoder.configure({
      codec: 'opus',
      sampleRate: config.sampleRate,
      numberOfChannels: 1,
      bitrate: 24000
    });
  },
  createDecoder: (userId) => {
    const decoder = new AudioDecoder({
      output: (audioData) => {
        const size = audioData.allocationSize({ planeIndex: 0 });
        const buffer = new ArrayBuffer(size);
        audioData.copyTo(buffer, { planeIndex: 0 });
        const samples = new Float32Array(buffer);
        if (!state.audioBuffers.has(userId)) state.audioBuffers.set(userId, []);
        state.audioBuffers.get(userId).push(samples);
        audioData.close();
        if (!state.audioSources.has(userId) && state.playbackState.get(userId) !== 'paused') {
          audio.play(userId);
        }
      },
      error: (e) => console.error('Decoder error:', e)
    });
    decoder.configure({
      codec: 'opus',
      sampleRate: config.sampleRate,
      numberOfChannels: 1
    });
    return decoder;
  }
};

const queue = {
  addSegment: (userId, username, isOwnAudio = false) => {
    const segment = {
      id: state.nextSegmentId++,
      userId,
      username,
      timestamp: new Date(),
      status: 'recording',
      chunks: [],
      decodedSamples: [],
      isOwnAudio,
      playedRealtime: false,
      videoChunks: []
    };
    state.activeSegments.set(userId, segment);
    return segment;
  },
  addChunk: (userId, chunkData) => {
    const segment = state.activeSegments.get(userId);
    if (segment) {
      segment.chunks.push(new Uint8Array(chunkData));
      // Update UI every 10 chunks to show progress
      if (segment.chunks.length % 10 === 0) {
        ui.render.queue();
      }
      return true;
    }
    return false;
  },
  completeSegment: (userId) => {
    const segment = state.activeSegments.get(userId);
    console.log('completeSegment called for userId:', userId, 'segment exists:', !!segment, 'chunks:', segment?.chunks?.length || 0, 'playedRealtime:', segment?.playedRealtime);
    if (segment && segment.chunks.length > 0) {
      // If played in real-time or own audio, mark as 'played' (available for replay but doesn't auto-play)
      // Only queue for playback if it wasn't played in real-time
      segment.status = (segment.isOwnAudio || segment.playedRealtime) ? 'played' : 'queued';
      state.audioQueue.push(segment);
      state.activeSegments.delete(userId);
      ui.render.queue();
      console.log('Segment completed. Status:', segment.status, 'currentSegmentId:', state.currentSegmentId, 'isDeafened:', state.isDeafened, 'isSpeaking:', state.isSpeaking);
      // Start playback if not currently playing and not deafened (skip own audio and real-time played)
      if (!state.currentSegmentId && !state.isDeafened && !state.isSpeaking && !segment.isOwnAudio && !segment.playedRealtime) {
        console.log('Starting playback...');
        queue.playNext();
      }
    } else {
      console.log('Segment not completed - no segment or no chunks');
    }
  },
  getNextQueuedSegment: () => {
    return state.audioQueue.find(seg => seg.status === 'queued');
  },
  markAsPlaying: (segmentId) => {
    const segment = state.audioQueue.find(s => s.id === segmentId);
    if (segment) {
      segment.status = 'playing';
      state.currentSegmentId = segmentId;
      ui.render.queue();
    }
  },
  markAsPlayed: (segmentId) => {
    const segment = state.audioQueue.find(s => s.id === segmentId);
    if (segment) {
      segment.status = 'played';
      state.currentSegmentId = null;
      ui.render.queue();
      // Play next if available
      queue.playNext();
    }
  },
  playNext: () => {
    if (state.isSpeaking || state.isDeafened || state.currentSegmentId) return;

    const nextSegment = queue.getNextQueuedSegment();
    if (!nextSegment) return;

    queue.markAsPlaying(nextSegment.id);
    queue.decodeAndPlay(nextSegment);
  },
  decodeAndPlay: (segment) => {
    console.log('Decoding segment:', segment.id, 'with', segment.chunks.length, 'chunks');

    // Create dedicated decoder for this segment
    const decoderId = `queue-${segment.id}`;
    let decodeErrors = 0;

    const decoder = new AudioDecoder({
      output: (audioData) => {
        const size = audioData.allocationSize({ planeIndex: 0 });
        const buffer = new ArrayBuffer(size);
        audioData.copyTo(buffer, { planeIndex: 0 });
        const samples = new Float32Array(buffer);
        segment.decodedSamples.push(samples);
        audioData.close();
      },
      error: (e) => {
        decodeErrors++;
        console.error('Queue decoder error:', e);
      }
    });
    decoder.configure({
      codec: 'opus',
      sampleRate: config.sampleRate,
      numberOfChannels: 1
    });

    // Decode all chunks
    segment.chunks.forEach((chunkData, index) => {
      try {
        const chunk = new EncodedAudioChunk({
          type: 'key',
          timestamp: index * 20000, // Use sequential timestamps (20ms per chunk)
          data: chunkData
        });
        decoder.decode(chunk);
      } catch (e) {
        console.error('Error creating/decoding chunk', index, ':', e);
      }
    });

    // Wait for decoding to complete, then play
    decoder.flush().then(() => {
      console.log('Decoding complete. Samples:', segment.decodedSamples.length, 'Errors:', decodeErrors);
      queue.playSamples(segment);
      decoder.close();
    }).catch(e => {
      console.error('Decoder flush error:', e);
      decoder.close();
      queue.markAsPlayed(segment.id);
    });
  },
  playSamples: (segment) => {
    if (segment.decodedSamples.length === 0) {
      console.log('No decoded samples to play for segment:', segment.id);
      queue.markAsPlayed(segment.id);
      return;
    }

    // Resume AudioContext if suspended (required by browsers)
    if (state.audioContext?.state === 'suspended') {
      state.audioContext.resume();
    }

    const gainNode = state.audioContext.createGain();
    gainNode.gain.value = state.masterVolume;
    gainNode.connect(state.audioContext.destination);

    let scheduledTime = state.audioContext.currentTime + 0.05;

    segment.decodedSamples.forEach(data => {
      const buf = state.audioContext.createBuffer(1, data.length, config.sampleRate);
      buf.getChannelData(0).set(data);
      const src = state.audioContext.createBufferSource();
      src.buffer = buf;
      src.connect(gainNode);
      src.start(scheduledTime);

      const duration = data.length / config.sampleRate;
      scheduledTime += duration;
    });

    // Mark as played after all samples finish
    const totalDuration = (scheduledTime - state.audioContext.currentTime) * 1000;
    setTimeout(() => {
      queue.markAsPlayed(segment.id);
    }, totalDuration);
  },
  pausePlayback: () => {
    // This will be called when PTT starts or deafen is activated
    // Current implementation will let the current segment finish
    // but prevent new segments from starting
  },
  resumePlayback: () => {
    // Resume queue playback
    if (!state.currentSegmentId) {
      queue.playNext();
    }
  },
  replaySegment: (segmentId, continueQueue = true) => {
    const segmentIndex = state.audioQueue.findIndex(s => s.id === segmentId);
    const segment = state.audioQueue[segmentIndex];
    if (!segment || segment.chunks.length === 0) return;

    state.replayingSegmentId = segmentId;
    ui.render.queue();

    const decodedSamples = [];
    const decoder = new AudioDecoder({
      output: (audioData) => {
        const size = audioData.allocationSize({ planeIndex: 0 });
        const buffer = new ArrayBuffer(size);
        audioData.copyTo(buffer, { planeIndex: 0 });
        decodedSamples.push(new Float32Array(buffer));
        audioData.close();
      },
      error: (e) => console.error('Replay decoder error:', e)
    });

    decoder.configure({ codec: 'opus', sampleRate: config.sampleRate, numberOfChannels: 1 });
    segment.chunks.forEach(chunkData => {
      decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: performance.now() * 1000, data: chunkData }));
    });

    decoder.flush().then(() => {
      if (decodedSamples.length === 0) {
        decoder.close();
        state.replayingSegmentId = null;
        return;
      }

      const gainNode = state.audioContext.createGain();
      gainNode.gain.value = state.masterVolume;
      gainNode.connect(state.audioContext.destination);

      let scheduledTime = state.audioContext.currentTime + 0.05;
      let totalDuration = 0;

      decodedSamples.forEach(data => {
        const buf = state.audioContext.createBuffer(1, data.length, config.sampleRate);
        buf.getChannelData(0).set(data);
        const src = state.audioContext.createBufferSource();
        src.buffer = buf;
        src.connect(gainNode);
        src.start(scheduledTime);
        totalDuration += data.length / config.sampleRate;
        scheduledTime += data.length / config.sampleRate;
      });

      if (segment.videoChunks && segment.videoChunks.length > 0) {
        webcam.showVideo(segment.videoChunks, segment.username);
        setTimeout(() => webcam.hidePlayback(), totalDuration * 1000 + 100);
      }

      decoder.close();

      setTimeout(() => {
        state.replayingSegmentId = null;
        ui.render.queue();
        if (continueQueue && segmentIndex + 1 < state.audioQueue.length) {
          queue.replaySegment(state.audioQueue[segmentIndex + 1].id, true);
        }
      }, totalDuration * 1000 + 50);
    });
  },
  downloadSegment: (segmentId) => {
    const segment = state.audioQueue.find(s => s.id === segmentId);
    if (!segment || segment.chunks.length === 0) return;

    const decodedSamples = [];
    const decoder = new AudioDecoder({
      output: (audioData) => {
        const size = audioData.allocationSize({ planeIndex: 0 });
        const buffer = new ArrayBuffer(size);
        audioData.copyTo(buffer, { planeIndex: 0 });
        decodedSamples.push(new Float32Array(buffer));
        audioData.close();
      },
      error: (e) => console.error('Download decoder error:', e)
    });

    decoder.configure({ codec: 'opus', sampleRate: config.sampleRate, numberOfChannels: 1 });
    segment.chunks.forEach(chunkData => {
      decoder.decode(new EncodedAudioChunk({ type: 'key', timestamp: performance.now() * 1000, data: chunkData }));
    });

    decoder.flush().then(() => {
      decoder.close();
      if (decodedSamples.length === 0) return;

      const totalLength = decodedSamples.reduce((sum, arr) => sum + arr.length, 0);
      const wavBuffer = new ArrayBuffer(44 + totalLength * 2);
      const view = new DataView(wavBuffer);
      const writeString = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
      writeString(0, 'RIFF');
      view.setUint32(4, 36 + totalLength * 2, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, config.sampleRate, true);
      view.setUint32(28, config.sampleRate * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeString(36, 'data');
      view.setUint32(40, totalLength * 2, true);

      let offset = 44;
      decodedSamples.forEach(samples => {
        samples.forEach(sample => {
          const s = Math.max(-1, Math.min(1, sample));
          view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
          offset += 2;
        });
      });

      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${segment.username}-${segment.timestamp.toISOString().slice(0,19).replace(/:/g,'-')}.wav`;
      a.click();
      URL.revokeObjectURL(url);

      if (segment.videoChunks && segment.videoChunks.length > 0) {
        const videoBlob = new Blob(segment.videoChunks, { type: 'video/webm' });
        const videoUrl = URL.createObjectURL(videoBlob);
        const va = document.createElement('a');
        va.href = videoUrl;
        va.download = `${segment.username}-${segment.timestamp.toISOString().slice(0,19).replace(/:/g,'-')}.webm`;
        va.click();
        URL.revokeObjectURL(videoUrl);
      }
    });
  }
};

const message = {
  handlers: {
    speaker_joined: (msg) => {
      console.log('speaker_joined received:', msg.userId, msg.user);
      state.activeSpeakers.add(msg.userId);
      // Create queue segment for this speaker (skip if it's our own user - we create it in ptt.start)
      if (msg.userId !== state.userId) {
        queue.addSegment(msg.userId, msg.user);
        console.log('Created queue segment for user:', msg.userId);
      }
      // Keep old system for replay functionality
      state.recordingAudio.set(msg.userId, []);
      message.add(`${msg.user} started talking`, null, msg.userId, msg.user);
      ui.render.speakers();
      ui.render.queue();
    },
    speaker_left: (msg) => {
      console.log('speaker_left received:', msg.userId, msg.user);
      state.activeSpeakers.delete(msg.userId);
      // Hide video playback when speaker stops
      webcam.hidePlayback();
      // Complete the queue segment (but not for own audio - that's handled in ptt.stop)
      if (msg.userId !== state.userId) {
        queue.completeSegment(msg.userId);
      }
      // Keep old system for replay
      const audioData = state.recordingAudio.get(msg.userId);
      message.add(`${msg.user} stopped talking`, audioData, msg.userId, msg.user);
      state.recordingAudio.delete(msg.userId);
      ui.render.speakers();
    },
    audio_data: (msg) => {
      // Create segment if it doesn't exist (handles race condition)
      if (!state.activeSegments.has(msg.userId) && !state.activeSpeakers.has(msg.userId)) {
        state.activeSpeakers.add(msg.userId);
        queue.addSegment(msg.userId, `User${msg.userId}`);
        state.recordingAudio.set(msg.userId, []);
        ui.render.speakers();
      }
      // Add chunk to queue segment (for replay)
      queue.addChunk(msg.userId, msg.data);
      // Keep old system for replay functionality
      if (state.recordingAudio.has(msg.userId)) {
        state.recordingAudio.get(msg.userId).push(new Uint8Array(msg.data));
      }
      // REAL-TIME PLAYBACK: decode and play immediately if not deafened/speaking
      if (!state.isDeafened && !state.isSpeaking) {
        audio.handleChunk(msg.userId, msg.data);
        // Mark segment as played in real-time so it won't play again from queue
        const segment = state.activeSegments.get(msg.userId);
        if (segment) {
          segment.playedRealtime = true;
        }
      }
    },
    video_chunk: (msg) => {
      const segment = state.activeSegments.get(msg.userId);
      if (segment) {
        if (!segment.videoChunks) segment.videoChunks = [];
        segment.videoChunks.push(msg.data);
      }
      if (!state.isDeafened && !state.isSpeaking) {
        if (!state.incomingVideoChunks) state.incomingVideoChunks = new Map();
        if (!state.incomingVideoChunks.has(msg.userId)) state.incomingVideoChunks.set(msg.userId, []);
        state.incomingVideoChunks.get(msg.userId).push(msg.data);
        const username = segment?.username || `User${msg.userId}`;
        webcam.streamChunk(msg.userId, msg.data, username);
      }
    },
    user_joined: (msg) => message.add(`${msg.user} joined`, null, msg.userId, msg.user),
    user_left: (msg) => message.add(`User left`, null, msg.userId),
    connection_established: (msg) => {
      state.userId = msg.clientId;
    },
    room_joined: (msg) => {
      message.add(`Joined room: ${msg.roomId}`, null, null, null);
      msg.currentUsers.forEach(u => message.add(`${u.username} is online`, null, u.id, u.username));
      ui.render.roomName();
    }
  },
  handle: (msg) => {
    const handler = message.handlers[msg.type];
    if (handler) handler(msg);
  },
  add: (text, audioData = null, userId = null, username = null) => {
    const msgId = Date.now() + Math.random();
    const msg = { id: msgId, text, time: new Date().toLocaleTimeString(), userId, username };
    if (audioData && audioData.length > 0) {
      msg.hasAudio = true;
      state.audioHistory.set(msgId, audioData);
    }
    state.messages.push(msg);
    if (state.messages.length > 50) {
      const removed = state.messages.shift();
      if (removed.hasAudio) state.audioHistory.delete(removed.id);
    }
    ui.render.messages();
  }
};

const network = {
  connect: () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    state.ws = new WebSocket(`${protocol}//${window.location.host}`);
    state.ws.binaryType = 'arraybuffer';
    state.ws.onopen = () => {
      ui.setStatus('Connected', false);
      network.send({ type: 'join_room', roomId: state.roomId });
    };
    state.ws.onmessage = (e) => {
      const msg = msgpackr.unpack(new Uint8Array(e.data));
      message.handle(msg);
    };
    state.ws.onerror = () => ui.setStatus('Error', true);
    state.ws.onclose = () => {
      ui.setStatus('Disconnected', true);
      setTimeout(network.connect, 3000);
    };
  },
  send: (msg) => {
    if (state.ws?.readyState === WebSocket.OPEN) {
      msg.roomId = state.roomId;
      state.ws.send(msgpackr.pack(msg));
    }
  }
};

const audioIO = {
  init: async () => {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: config.sampleRate });
    try {
      state.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      audioIO.setupRecording();
    } catch (err) {
      ui.setStatus('Microphone denied', true);
    }
  },
  setupRecording: () => {
    audio.initEncoder();
    state.scriptProcessor = state.audioContext.createScriptProcessor(config.chunkSize, 1, 1);
    const source = state.audioContext.createMediaStreamSource(state.mediaStream);
    state.scriptProcessor.onaudioprocess = (e) => {
      if (state.isSpeaking && state.audioEncoder) {
        const samples = e.inputBuffer.getChannelData(0);
        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate: config.sampleRate,
          numberOfFrames: samples.length,
          numberOfChannels: 1,
          timestamp: performance.now() * 1000,
          data: samples
        });
        state.audioEncoder.encode(audioData);
        audioData.close();
      }
    };
    source.connect(state.scriptProcessor);
    state.scriptProcessor.connect(state.audioContext.destination);
  }
};

Object.assign(audio, {
  handleChunk: (userId, data) => {
    // Resume AudioContext if suspended
    if (state.audioContext?.state === 'suspended') {
      state.audioContext.resume();
    }
    if (!state.audioDecoders.has(userId)) {
      state.audioDecoders.set(userId, audio.createDecoder(userId));
    }
    const decoder = state.audioDecoders.get(userId);
    try {
      const chunk = new EncodedAudioChunk({
        type: 'key',
        timestamp: performance.now() * 1000,
        data: new Uint8Array(data)
      });
      decoder.decode(chunk);
    } catch (e) {
      console.error('Error decoding chunk:', e);
    }
  },
  play: (userId) => {
    if (state.audioSources.has(userId)) return;
    // Resume AudioContext if suspended
    if (state.audioContext?.state === 'suspended') {
      state.audioContext.resume();
    }
    const gainNode = state.audioContext.createGain();
    gainNode.gain.value = state.masterVolume;
    gainNode.connect(state.audioContext.destination);
    state.audioSources.set(userId, { gainNode });
    state.playbackState.set(userId, 'playing');

    // Initialize scheduled time to current time (with small buffer for processing)
    if (!state.scheduledPlaybackTime.has(userId)) {
      state.scheduledPlaybackTime.set(userId, state.audioContext.currentTime + 0.05);
    }

    const interval = setInterval(() => {
      if (!state.audioSources.has(userId)) {
        clearInterval(interval);
        return;
      }
      const queue = state.audioBuffers.get(userId);
      if (!queue?.length) {
        if (!state.activeSpeakers.has(userId)) {
          state.audioSources.delete(userId);
          state.audioBuffers.delete(userId);
          state.playbackState.delete(userId);
          state.scheduledPlaybackTime.delete(userId);
          clearInterval(interval);
        }
        return;
      }

      const data = queue.shift();
      const buf = state.audioContext.createBuffer(1, data.length, config.sampleRate);
      buf.getChannelData(0).set(data);
      const src = state.audioContext.createBufferSource();
      src.buffer = buf;
      src.connect(gainNode);

      // Get the current scheduled time
      let scheduledTime = state.scheduledPlaybackTime.get(userId);
      const currentTime = state.audioContext.currentTime;

      // If we're behind, reset to current time to avoid audio glitches
      if (scheduledTime < currentTime) {
        scheduledTime = currentTime;
      }

      // Schedule the audio to start at the precise time
      src.start(scheduledTime);

      // Update scheduled time for next chunk (duration = samples / sample rate)
      const duration = data.length / config.sampleRate;
      state.scheduledPlaybackTime.set(userId, scheduledTime + duration);
    }, 20);
  },
  pause: () => {
    const userId = Array.from(state.activeSpeakers)[0];
    if (userId && state.audioSources.has(userId)) {
      state.pausedAudioBuffer = state.audioBuffers.get(userId) ? [...state.audioBuffers.get(userId)] : null;
      state.playbackState.set(userId, 'paused');
      state.audioSources.delete(userId);
      state.audioBuffers.set(userId, []);
      state.scheduledPlaybackTime.delete(userId);
    }
  },
  resume: () => {
    if (!state.pausedAudioBuffer) return;
    const userId = Array.from(state.activeSpeakers)[0];
    if (userId) {
      state.audioBuffers.set(userId, state.pausedAudioBuffer);
      state.playbackState.set(userId, 'playing');
      audio.play(userId);
      state.pausedAudioBuffer = null;
    }
  },
  replay: (msgId) => {
    const audioChunks = state.audioHistory.get(msgId);
    if (!audioChunks || audioChunks.length === 0) return;
    const replayId = 'replay-' + msgId;
    if (!state.audioDecoders.has(replayId)) {
      state.audioDecoders.set(replayId, audio.createDecoder(replayId));
    }
    const decoder = state.audioDecoders.get(replayId);
    audioChunks.forEach(chunkData => {
      const chunk = new EncodedAudioChunk({
        type: 'key',
        timestamp: performance.now() * 1000,
        data: chunkData
      });
      decoder.decode(chunk);
    });
  },
  pauseAll: () => {
    // Store current buffers and stop all playback
    state.pausedBuffers = new Map();
    state.audioSources.forEach((source, userId) => {
      const buffers = state.audioBuffers.get(userId);
      if (buffers && buffers.length > 0) {
        state.pausedBuffers.set(userId, [...buffers]);
      }
      state.audioBuffers.set(userId, []);
      state.playbackState.set(userId, 'paused');
    });
    // Clear all audio sources to stop playback intervals
    state.audioSources.clear();
    state.scheduledPlaybackTime.clear();
  },
  resumeAll: () => {
    // Restore paused buffers and resume playback
    if (state.pausedBuffers) {
      state.pausedBuffers.forEach((buffers, userId) => {
        if (buffers.length > 0) {
          const existingBuffers = state.audioBuffers.get(userId) || [];
          state.audioBuffers.set(userId, [...buffers, ...existingBuffers]);
          state.playbackState.set(userId, 'playing');
          // Restart playback if there are active speakers or buffered audio
          if (state.activeSpeakers.has(userId) || state.audioBuffers.get(userId)?.length > 0) {
            audio.play(userId);
          }
        }
      });
      state.pausedBuffers = null;
    }
    // Also restart playback for any active speakers that accumulated audio while paused
    state.activeSpeakers.forEach(userId => {
      if (!state.audioSources.has(userId) && state.audioBuffers.get(userId)?.length > 0) {
        state.playbackState.set(userId, 'playing');
        audio.play(userId);
      }
    });
  }
});

const ptt = {
  start: () => {
    state.isSpeaking = true;
    ui.ptt.classList.add('recording');
    ui.recordingIndicator.style.display = 'inline';
    // Resume AudioContext on user gesture (required by browsers)
    if (state.audioContext?.state === 'suspended') {
      state.audioContext.resume();
    }
    // Pause all incoming audio playback while speaking
    audio.pauseAll();
    // Hide any video playback
    webcam.hidePlayback();
    state.ownAudioChunks = [];
    state.ownVideoChunks = [];
    // Create queue segment for own audio
    if (state.userId) {
      queue.addSegment(state.userId, 'You', true);
    }
    // Start webcam capture if enabled
    if (state.webcamEnabled) {
      webcam.startCapture();
    }
    network.send({ type: 'audio_start' });
  },
  stop: async () => {
    state.isSpeaking = false;
    ui.ptt.classList.remove('recording');
    ui.recordingIndicator.style.display = 'none';

    // Stop webcam capture
    webcam.stopCapture();

    // Flush encoder to ensure all audio data is sent before audio_end
    if (state.audioEncoder && state.audioEncoder.state === 'configured') {
      try {
        await state.audioEncoder.flush();
      } catch (e) {
        console.error('Encoder flush error:', e);
      }
    }

    network.send({ type: 'audio_end' });
    // Complete own audio segment with collected chunks and video frames
    if (state.userId) {
      const ownSegment = state.activeSegments.get(state.userId);
      if (ownSegment) {
        ownSegment.chunks = [...state.ownAudioChunks];
        ownSegment.videoChunks = [...state.ownVideoChunks];
      }
      queue.completeSegment(state.userId);
    }
    // Resume all incoming audio playback
    audio.resumeAll();
    // Resume queue playback
    queue.resumePlayback();
  }
};

const deafen = {
  toggle: () => {
    state.isDeafened = !state.isDeafened;
    if (state.isDeafened) {
      deafen.activate();
    } else {
      deafen.deactivate();
    }
  },
  activate: () => {
    ui.deafenBtn.classList.add('active');
    ui.deafenBtn.innerHTML = '🔇 Deafened';
    // Queue will continue to accumulate but won't play
    ui.render.queue();
  },
  deactivate: () => {
    ui.deafenBtn.classList.remove('active');
    ui.deafenBtn.innerHTML = '🔊 Deafen';
    // Resume playing queued audio
    queue.resumePlayback();
    ui.render.queue();
  }
};

const vad = {
  toggle: () => {
    state.vadEnabled = !state.vadEnabled;
    if (state.vadEnabled) {
      vad.activate();
    } else {
      vad.deactivate();
    }
  },
  activate: () => {
    ui.vadBtn.classList.add('active');
    ui.vadBtn.innerHTML = '🎤 VAD Active';
    ui.vadControls.style.display = 'flex';
    ui.vadMeterContainer.style.display = 'block';
    ui.ptt.innerHTML = 'VAD MODE';
    ui.ptt.style.pointerEvents = 'none';
    ui.ptt.style.opacity = '0.6';
    vad.startMonitoring();
  },
  deactivate: () => {
    ui.vadBtn.classList.remove('active');
    ui.vadBtn.innerHTML = '🎤 Voice Activation';
    ui.vadControls.style.display = 'none';
    ui.vadMeterContainer.style.display = 'none';
    ui.ptt.innerHTML = 'HOLD TO TALK';
    ui.ptt.style.pointerEvents = 'auto';
    ui.ptt.style.opacity = '1';
    vad.stopMonitoring();
    // Stop speaking if currently active
    if (state.isSpeaking) {
      ptt.stop();
    }
  },
  startMonitoring: () => {
    if (!state.audioContext || !state.mediaStream) return;
    
    // Create analyser if not exists
    if (!state.vadAnalyser) {
      state.vadAnalyser = state.audioContext.createAnalyser();
      state.vadAnalyser.fftSize = 512;
      state.vadAnalyser.smoothingTimeConstant = 0.3;
      const source = state.audioContext.createMediaStreamSource(state.mediaStream);
      source.connect(state.vadAnalyser);
    }
    
    const dataArray = new Uint8Array(state.vadAnalyser.frequencyBinCount);
    
    const checkLevel = () => {
      if (!state.vadEnabled) return;
      
      state.vadAnalyser.getByteFrequencyData(dataArray);
      
      // Calculate RMS level
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length) / 255;
      
      // Update meter
      ui.vadMeter.style.width = (rms * 100) + '%';
      
      // Check against threshold
      if (rms > state.vadThreshold) {
        // Voice detected
        if (state.vadSilenceTimer) {
          clearTimeout(state.vadSilenceTimer);
          state.vadSilenceTimer = null;
        }
        if (!state.isSpeaking) {
          ptt.start();
        }
      } else {
        // Silence detected
        if (state.isSpeaking && !state.vadSilenceTimer) {
          state.vadSilenceTimer = setTimeout(() => {
            if (state.vadEnabled && state.isSpeaking) {
              ptt.stop();
            }
            state.vadSilenceTimer = null;
          }, state.vadSilenceDelay);
        }
      }
      
      requestAnimationFrame(checkLevel);
    };
    
    checkLevel();
  },
  stopMonitoring: () => {
    if (state.vadSilenceTimer) {
      clearTimeout(state.vadSilenceTimer);
      state.vadSilenceTimer = null;
    }
  },
  setThreshold: (value) => {
    state.vadThreshold = value / 100;
    ui.vadThresholdMarker.style.left = value + '%';
  }
};

const ui_render = {
  speakers: () => {
    ui.speakers.innerHTML = '';
    state.activeSpeakers.forEach(id => {
      const div = document.createElement('div');
      div.className = 'item active';
      div.innerHTML = `<div class="item-header">User${id}</div><div class="item-meta">Live</div>`;
      ui.speakers.appendChild(div);
    });
  },
  messages: () => {
    ui.messages.innerHTML = state.messages.map(m => `
      <div class="item">
        <div class="item-header">${m.text}</div>
        <div class="item-meta">
          ${m.time}
          ${m.hasAudio ? `<button class="replay-btn" data-msg-id="${m.id}">▶ Replay</button>` : ''}
        </div>
      </div>
    `).join('');
    ui.messages.scrollTop = ui.messages.scrollHeight;
    document.querySelectorAll('.replay-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const msgId = parseFloat(e.target.dataset.msgId);
        audio.replay(msgId);
      });
    });
  },
  roomName: () => {
    ui.roomName.textContent = `Room: ${state.roomId}`;
  },
  queue: () => {
    const allSegments = [
      ...Array.from(state.activeSegments.values()),
      ...state.audioQueue
    ];

    if (allSegments.length === 0) {
      ui.audioQueueView.innerHTML = '<div style="opacity: 0.5; font-size: 11px; text-align: center; padding: 20px;">No audio in queue</div>';
      return;
    }

    const separatorIndex = allSegments.findIndex(s => s.status === 'playing' || s.status === 'queued');

    let html = '';
    allSegments.forEach((segment, index) => {
      if (index === separatorIndex && separatorIndex > 0) {
        html += '<div class="queue-separator">▼ Unplayed ▼</div>';
      }

      const isReplaying = state.replayingSegmentId === segment.id;
      const statusIcon = isReplaying ? '🔊' : {
        'recording': '🔴',
        'queued': '⏸️',
        'playing': '▶️',
        'played': '✓'
      }[segment.status] || '•';

      const timeStr = segment.timestamp.toLocaleTimeString();
      const hasVideo = segment.videoChunks && segment.videoChunks.length > 0;
      const videoIcon = hasVideo ? ' 📹' : '';

      const clickable = segment.chunks.length > 0 && segment.status !== 'recording';
      const ownAudioLabel = segment.isOwnAudio ? ' <span style="opacity: 0.5;">(You)</span>' : '';
      const replayingClass = isReplaying ? ' replaying' : '';

      html += `
        <div class="queue-item ${segment.status}${replayingClass}" data-segment-id="${segment.id}">
          <div class="queue-header">${statusIcon} ${segment.username}${ownAudioLabel}${videoIcon}</div>
          <div class="queue-meta">
            ${timeStr} • ${segment.chunks.length} chunks${hasVideo ? ' • video' : ''}
            ${clickable ? `<button class="queue-play-btn" data-id="${segment.id}">▶</button><button class="queue-dl-btn" data-id="${segment.id}">⬇</button>` : ''}
          </div>
        </div>
      `;
    });

    ui.audioQueueView.innerHTML = html;

    document.querySelectorAll('.queue-play-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        queue.replaySegment(parseInt(btn.dataset.id), true);
      });
    });
    document.querySelectorAll('.queue-dl-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        queue.downloadSegment(parseInt(btn.dataset.id));
      });
    });

    // Auto-scroll to keep the separator or current playing item visible
    const separator = ui.audioQueueView.querySelector('.queue-separator');
    const playing = ui.audioQueueView.querySelector('.queue-item.playing');
    const target = separator || playing;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
};

ui.setStatus = (text, isError) => {
  ui.statusDot.className = isError ? 'status-dot offline' : 'status-dot';
  ui.statusText.textContent = text;
  ui.connectionStatus.textContent = text;
};

ui.render = ui_render;

const ui_events = {
  setup: () => {
    // Resume AudioContext on any user interaction (required by browsers)
    const resumeAudioContext = () => {
      if (state.audioContext?.state === 'suspended') {
        state.audioContext.resume().then(() => {
          console.log('AudioContext resumed');
        });
      }
    };
    document.addEventListener('click', resumeAudioContext, { once: false });
    document.addEventListener('touchstart', resumeAudioContext, { once: false });
    document.addEventListener('keydown', resumeAudioContext, { once: false });
    
    ui.ptt.addEventListener('mousedown', () => { if (!state.vadEnabled) ptt.start(); });
    ui.ptt.addEventListener('mouseup', () => { if (!state.vadEnabled) ptt.stop(); });
    ui.ptt.addEventListener('touchstart', () => { if (!state.vadEnabled) ptt.start(); });
    ui.ptt.addEventListener('touchend', () => { if (!state.vadEnabled) ptt.stop(); });
    ui.ptt.addEventListener('touchcancel', () => { if (!state.vadEnabled) ptt.stop(); });
    ui.volumeSlider.addEventListener('input', (e) => {
      state.masterVolume = e.target.value / 100;
      state.audioSources.forEach(s => s.gainNode.gain.value = state.masterVolume);
      ui.volumeValue.textContent = e.target.value + '%';
    });
    ui.deafenBtn.addEventListener('click', deafen.toggle);
    ui.vadBtn.addEventListener('click', vad.toggle);
    ui.vadThreshold.addEventListener('input', (e) => {
      vad.setThreshold(e.target.value);
      ui.vadValue.textContent = e.target.value + '%';
    });
    ui.webcamBtn.addEventListener('click', webcam.toggle);
    ui.webcamResolution.addEventListener('change', (e) => {
      state.webcamResolution = e.target.value;
      if (state.webcamEnabled) {
        webcam.disable();
        webcam.enable();
      }
    });
    ui.webcamFps.addEventListener('change', (e) => {
      state.webcamFps = parseInt(e.target.value);
      if (state.webcamEnabled) {
        webcam.disable();
        webcam.enable();
      }
    });
  }
};

const webcam = {
  toggle: async () => {
    if (state.webcamEnabled) {
      webcam.disable();
    } else {
      await webcam.enable();
    }
  },
  enable: async () => {
    try {
      const [width, height] = state.webcamResolution.split('x').map(Number);
      state.webcamStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width, height, frameRate: state.webcamFps, facingMode: 'user' } 
      });
      ui.webcamVideo.srcObject = state.webcamStream;
      ui.webcamPreview.style.display = 'block';
      ui.webcamBtn.classList.add('active');
      ui.webcamBtn.innerHTML = '📷 Webcam On';
      state.webcamEnabled = true;
    } catch (err) {
      console.error('Webcam error:', err);
      ui.webcamBtn.innerHTML = '📷 Webcam Denied';
    }
  },
  disable: () => {
    if (state.webcamStream) {
      state.webcamStream.getTracks().forEach(track => track.stop());
      state.webcamStream = null;
    }
    ui.webcamVideo.srcObject = null;
    ui.webcamPreview.style.display = 'none';
    ui.webcamBtn.classList.remove('active');
    ui.webcamBtn.innerHTML = '📷 Webcam Off';
    state.webcamEnabled = false;
    webcam.stopCapture();
  },
  startCapture: () => {
    if (!state.webcamEnabled || !state.webcamStream) return;
    state.ownVideoChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' :
                     MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' :
                     MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4';
    const [width, height] = state.webcamResolution.split('x').map(Number);
    const bitrate = Math.round(width * height * state.webcamFps * 0.1);
    state.webcamRecorder = new MediaRecorder(state.webcamStream, { mimeType, videoBitsPerSecond: bitrate });
    state.webcamRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        e.data.arrayBuffer().then((buffer) => {
          const data = new Uint8Array(buffer);
          state.ownVideoChunks.push(data);
          network.send({ type: 'video_chunk', data: data });
        });
      }
    };
    state.webcamRecorder.start(500);
  },
  stopCapture: () => {
    if (state.webcamRecorder && state.webcamRecorder.state !== 'inactive') {
      state.webcamRecorder.stop();
      state.webcamRecorder = null;
    }
  },
  showVideo: (videoChunks, username) => {
    if (!videoChunks || videoChunks.length === 0) {
      ui.videoPlayback.style.display = 'none';
      return;
    }
    const mimeType = 'video/webm';
    const blob = new Blob(videoChunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    if (ui.videoPlaybackVideo.src) URL.revokeObjectURL(ui.videoPlaybackVideo.src);
    ui.videoPlaybackVideo.src = url;
    ui.videoPlaybackVideo.play();
    ui.videoPlaybackLabel.textContent = username || 'Unknown';
    ui.videoPlayback.style.display = 'block';
  },
  streamChunk: (userId, chunk, username) => {
    if (!state.mediaSource) {
      state.mediaSource = new Map();
    }
    if (!state.mediaSource.has(userId)) {
      const ms = new MediaSource();
      const url = URL.createObjectURL(ms);
      state.mediaSource.set(userId, { ms, url, buffer: null, queue: [] });
      ms.addEventListener('sourceopen', () => {
        const mimeType = 'video/webm;codecs=vp8';
        if (MediaSource.isTypeSupported(mimeType)) {
          const sb = ms.addSourceBuffer(mimeType);
          const entry = state.mediaSource.get(userId);
          entry.buffer = sb;
          sb.addEventListener('updateend', () => {
            if (entry.queue.length > 0 && !sb.updating) {
              sb.appendBuffer(entry.queue.shift());
            }
          });
        }
      });
      ui.videoPlaybackVideo.src = url;
      ui.videoPlaybackLabel.textContent = username || 'Unknown';
      ui.videoPlayback.style.display = 'block';
    }
    const entry = state.mediaSource.get(userId);
    if (entry.buffer && !entry.buffer.updating) {
      entry.buffer.appendBuffer(chunk);
    } else {
      entry.queue.push(chunk);
    }
  },
  hidePlayback: () => {
    ui.videoPlayback.style.display = 'none';
    if (ui.videoPlaybackVideo.src) {
      ui.videoPlaybackVideo.pause();
      URL.revokeObjectURL(ui.videoPlaybackVideo.src);
      ui.videoPlaybackVideo.src = '';
    }
    if (state.mediaSource) {
      state.mediaSource.forEach((entry) => {
        if (entry.ms.readyState === 'open') {
          entry.ms.endOfStream();
        }
        URL.revokeObjectURL(entry.url);
      });
      state.mediaSource.clear();
    }
  }
};

window.zellousDebug = {
  state,
  config,
  audio,
  message,
  network,
  ptt,
  queue,
  deafen,
  vad,
  webcam
};

async function init() {
  ui.render.roomName();
  await audioIO.init();
  network.connect();
  ui_events.setup();
}

init();
