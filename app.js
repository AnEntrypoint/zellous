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
  isDeafened: false,           // Deafen mode toggle
  nextSegmentId: 1,            // Counter for unique segment IDs
  ownAudioChunks: []           // Temporary storage for own audio chunks while recording
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
  deafenBtn: document.getElementById('deafenBtn')
};

const audio = {
  initEncoder: () => {
    state.audioEncoder = new AudioEncoder({
      output: (chunk, metadata) => {
        const buffer = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buffer);
        // Store own audio chunks for queue replay
        state.ownAudioChunks.push(new Uint8Array(buffer));
        network.send({ type: 'audio_chunk', data: Array.from(buffer) });
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
      isOwnAudio
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
    console.log('completeSegment called for userId:', userId, 'segment exists:', !!segment, 'chunks:', segment?.chunks?.length || 0);
    if (segment && segment.chunks.length > 0) {
      // Own audio goes directly to 'played' status (available for replay but doesn't auto-play)
      segment.status = segment.isOwnAudio ? 'played' : 'queued';
      state.audioQueue.push(segment);
      state.activeSegments.delete(userId);
      ui.render.queue();
      console.log('Segment completed. Status:', segment.status, 'currentSegmentId:', state.currentSegmentId, 'isDeafened:', state.isDeafened, 'isSpeaking:', state.isSpeaking);
      // Start playback if not currently playing and not deafened (skip own audio)
      if (!state.currentSegmentId && !state.isDeafened && !state.isSpeaking && !segment.isOwnAudio) {
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
  replaySegment: (segmentId) => {
    const segment = state.audioQueue.find(s => s.id === segmentId);
    if (!segment || segment.chunks.length === 0) return;

    // Create dedicated decoder for replay
    const decoderId = `replay-${segmentId}-${Date.now()}`;
    const decodedSamples = [];

    const decoder = new AudioDecoder({
      output: (audioData) => {
        const size = audioData.allocationSize({ planeIndex: 0 });
        const buffer = new ArrayBuffer(size);
        audioData.copyTo(buffer, { planeIndex: 0 });
        const samples = new Float32Array(buffer);
        decodedSamples.push(samples);
        audioData.close();
      },
      error: (e) => console.error('Replay decoder error:', e)
    });

    decoder.configure({
      codec: 'opus',
      sampleRate: config.sampleRate,
      numberOfChannels: 1
    });

    // Decode all chunks
    segment.chunks.forEach(chunkData => {
      const chunk = new EncodedAudioChunk({
        type: 'key',
        timestamp: performance.now() * 1000,
        data: chunkData
      });
      decoder.decode(chunk);
    });

    // Wait for decoding to complete, then play
    decoder.flush().then(() => {
      if (decodedSamples.length === 0) {
        decoder.close();
        return;
      }

      const gainNode = state.audioContext.createGain();
      gainNode.gain.value = state.masterVolume;
      gainNode.connect(state.audioContext.destination);

      let scheduledTime = state.audioContext.currentTime + 0.05;

      decodedSamples.forEach(data => {
        const buf = state.audioContext.createBuffer(1, data.length, config.sampleRate);
        buf.getChannelData(0).set(data);
        const src = state.audioContext.createBufferSource();
        src.buffer = buf;
        src.connect(gainNode);
        src.start(scheduledTime);

        const duration = data.length / config.sampleRate;
        scheduledTime += duration;
      });

      decoder.close();
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
      // Add chunk to queue segment (for queue playback)
      const added = queue.addChunk(msg.userId, msg.data);
      if (!added) {
        console.warn('audio_data received but no segment exists for userId:', msg.userId);
      }
      // Keep old system for replay functionality
      if (state.recordingAudio.has(msg.userId)) {
        state.recordingAudio.get(msg.userId).push(new Uint8Array(msg.data));
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
    state.ws.onopen = () => {
      ui.setStatus('Connected', false);
      network.send({ type: 'join_room', roomId: state.roomId });
    };
    state.ws.onmessage = (e) => message.handle(JSON.parse(e.data));
    state.ws.onerror = () => ui.setStatus('Error', true);
    state.ws.onclose = () => {
      ui.setStatus('Disconnected', true);
      setTimeout(network.connect, 3000);
    };
  },
  send: (msg) => {
    if (state.ws?.readyState === WebSocket.OPEN) {
      msg.roomId = state.roomId;
      state.ws.send(JSON.stringify(msg));
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
    if (!state.audioDecoders.has(userId)) {
      state.audioDecoders.set(userId, audio.createDecoder(userId));
    }
    const decoder = state.audioDecoders.get(userId);
    const chunk = new EncodedAudioChunk({
      type: 'key',
      timestamp: performance.now() * 1000,
      data: new Uint8Array(data)
    });
    decoder.decode(chunk);
  },
  play: (userId) => {
    if (state.audioSources.has(userId)) return;
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
    // Clear previous own audio chunks
    state.ownAudioChunks = [];
    // Create queue segment for own audio
    if (state.userId) {
      queue.addSegment(state.userId, 'You', true);
    }
    // Queue system will automatically stop playing new segments while speaking
    network.send({ type: 'audio_start' });
  },
  stop: async () => {
    state.isSpeaking = false;
    ui.ptt.classList.remove('recording');
    ui.recordingIndicator.style.display = 'none';

    // Flush encoder to ensure all audio data is sent before audio_end
    if (state.audioEncoder && state.audioEncoder.state === 'configured') {
      try {
        await state.audioEncoder.flush();
      } catch (e) {
        console.error('Encoder flush error:', e);
      }
    }

    network.send({ type: 'audio_end' });
    // Complete own audio segment with collected chunks
    if (state.userId) {
      const ownSegment = state.activeSegments.get(state.userId);
      if (ownSegment) {
        // Copy chunks from ownAudioChunks to the segment
        ownSegment.chunks = [...state.ownAudioChunks];
      }
      queue.completeSegment(state.userId);
    }
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

    // Find the index of the first queued or playing segment
    const separatorIndex = allSegments.findIndex(s => s.status === 'playing' || s.status === 'queued');

    let html = '';
    allSegments.forEach((segment, index) => {
      // Add separator before first unplayed segment
      if (index === separatorIndex && separatorIndex > 0) {
        html += '<div class="queue-separator">▼ Unplayed ▼</div>';
      }

      const statusIcon = {
        'recording': '🔴',
        'queued': '⏸️',
        'playing': '▶️',
        'played': '✓'
      }[segment.status] || '•';

      const timeStr = segment.timestamp.toLocaleTimeString();

      // Make clickable if has chunks and not currently recording
      const clickable = segment.chunks.length > 0 && segment.status !== 'recording';
      const cursorStyle = clickable ? 'cursor: pointer;' : '';
      const ownAudioLabel = segment.isOwnAudio ? ' <span style="opacity: 0.5;">(You)</span>' : '';

      html += `
        <div class="queue-item ${segment.status}" data-segment-id="${segment.id}" style="${cursorStyle}">
          <div class="queue-header">${statusIcon} ${segment.username}${ownAudioLabel}</div>
          <div class="queue-meta">${timeStr} • ${segment.chunks.length} chunks ${clickable ? '• Click to replay' : ''}</div>
        </div>
      `;
    });

    ui.audioQueueView.innerHTML = html;

    // Add click handlers to clickable queue items
    document.querySelectorAll('.queue-item[data-segment-id]').forEach(item => {
      const segmentId = parseInt(item.dataset.segmentId);
      const segment = allSegments.find(s => s.id === segmentId);
      if (segment && segment.chunks.length > 0 && segment.status !== 'recording') {
        item.addEventListener('click', () => {
          queue.replaySegment(segmentId);
        });
      }
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
    ui.ptt.addEventListener('mousedown', ptt.start);
    ui.ptt.addEventListener('mouseup', ptt.stop);
    ui.ptt.addEventListener('touchstart', ptt.start);
    ui.ptt.addEventListener('touchend', ptt.stop);
    ui.ptt.addEventListener('touchcancel', ptt.stop);
    ui.volumeSlider.addEventListener('input', (e) => {
      state.masterVolume = e.target.value / 100;
      state.audioSources.forEach(s => s.gainNode.gain.value = state.masterVolume);
      ui.volumeValue.textContent = e.target.value + '%';
    });
    ui.deafenBtn.addEventListener('click', deafen.toggle);
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
  deafen
};

async function init() {
  ui.render.roomName();
  await audioIO.init();
  network.connect();
  ui_events.setup();
}

init();
