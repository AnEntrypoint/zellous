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
  ws: null,
  userId: null,
  roomId: getRoomFromURL()
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
  roomName: document.getElementById('roomName')
};

const audio = {
  initEncoder: () => {
    state.audioEncoder = new AudioEncoder({
      output: (chunk, metadata) => {
        const buffer = new Uint8Array(chunk.byteLength);
        chunk.copyTo(buffer);
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

const message = {
  handlers: {
    speaker_joined: (msg) => {
      state.activeSpeakers.add(msg.userId);
      state.recordingAudio.set(msg.userId, []);
      if (!state.audioDecoders.has(msg.userId)) {
        state.audioDecoders.set(msg.userId, audio.createDecoder(msg.userId));
      }
      message.add(`${msg.user} started talking`, null, msg.userId, msg.user);
      ui.render.speakers();
    },
    speaker_left: (msg) => {
      state.activeSpeakers.delete(msg.userId);
      const audioData = state.recordingAudio.get(msg.userId);
      message.add(`${msg.user} stopped talking`, audioData, msg.userId, msg.user);
      state.recordingAudio.delete(msg.userId);
      ui.render.speakers();
      if (state.pausedAudioBuffer && msg.userId === Array.from(state.activeSpeakers)[0]) {
        audio.resume();
      }
    },
    audio_data: (msg) => {
      audio.handleChunk(msg.userId, msg.data);
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
      src.start();
    }, 100);
  },
  pause: () => {
    const userId = Array.from(state.activeSpeakers)[0];
    if (userId && state.audioSources.has(userId)) {
      state.pausedAudioBuffer = state.audioBuffers.get(userId) ? [...state.audioBuffers.get(userId)] : null;
      state.playbackState.set(userId, 'paused');
      state.audioSources.delete(userId);
      state.audioBuffers.set(userId, []);
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
    audio.pause();
    network.send({ type: 'audio_start' });
  },
  stop: () => {
    state.isSpeaking = false;
    ui.ptt.classList.remove('recording');
    ui.recordingIndicator.style.display = 'none';
    network.send({ type: 'audio_end' });
    audio.resume();
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
  }
};

window.zellousDebug = {
  state,
  config,
  audio,
  message,
  network,
  ptt
};

async function init() {
  ui.render.roomName();
  await audioIO.init();
  network.connect();
  ui_events.setup();
}

init();
