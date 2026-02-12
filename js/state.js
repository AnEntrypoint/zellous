import { signal, computed } from '@preact/signals';

const getRoomFromURL = () => new URLSearchParams(window.location.search).get('room') || 'lobby';
const config = { chunkSize: 4096, sampleRate: 48000 };

const state = {
  // Audio state
  isSpeaking: signal(false),
  audioContext: signal(null),
  mediaStream: signal(null),
  scriptProcessor: signal(null),
  audioBuffers: signal(new Map()),
  audioSources: signal(new Map()),
  playbackState: signal(new Map()),
  pausedAudioBuffer: signal(null),
  pausedBuffers: signal(null),
  masterVolume: signal(0.7),
  activeSpeakers: signal(new Set()),
  messages: signal([]),
  audioHistory: signal(new Map()),
  recordingAudio: signal(new Map()),
  audioEncoder: signal(null),
  audioDecoders: signal(new Map()),
  scheduledPlaybackTime: signal(new Map()),
  ws: signal(null),
  userId: signal(null),
  roomId: signal(getRoomFromURL()),
  audioQueue: signal([]),
  activeSegments: signal(new Map()),
  currentSegmentId: signal(null),
  replayingSegmentId: signal(null),
  replayGainNode: signal(null),
  replayTimeout: signal(null),
  skipLiveAudio: signal(false),
  currentLiveSpeaker: signal(null),
  isDeafened: signal(false),
  nextSegmentId: signal(1),
  ownAudioChunks: signal([]),
  recentlyEndedSpeakers: signal(new Set()),

  // VAD state
  vadEnabled: signal(false),
  vadThreshold: signal(0.15),
  vadSilenceDelay: signal(1500),
  vadSilenceTimer: signal(null),
  vadAnalyser: signal(null),

  // Webcam state
  webcamEnabled: signal(false),
  webcamStream: signal(null),
  webcamRecorder: signal(null),
  webcamResolution: signal('320x240'),
  webcamFps: signal(15),
  ownVideoChunks: signal([]),
  incomingVideoChunks: signal(null),
  liveVideoChunks: signal(null),
  liveVideoInterval: signal(null),

  // Device state
  inputDeviceId: signal(null),
  outputDeviceId: signal(null),
  inputDevices: signal([]),
  outputDevices: signal([]),

  // Chat state
  chatMessages: signal([]),
  chatInputValue: signal(''),

  // Auth state
  isAuthenticated: signal(false),
  currentUser: signal(null),

  // File browser state
  currentFilePath: signal(''),
  fileList: signal([]),

  // UI state
  activePanel: signal('main'),
  showAuthModal: signal(false),
  showSettingsModal: signal(false),

  // Connection state
  isConnected: signal(false),
  connectionStatus: signal('Connecting...'),

  // User directory
  users: signal(new Map())
};

// Create a proxy that makes signals transparent to legacy code
const stateProxy = new Proxy(state, {
  get: (target, prop) => {
    const value = target[prop];
    // Return .value for signals, otherwise return the property
    return value?.value !== undefined ? value.value : value;
  },
  set: (target, prop, val) => {
    const signal = target[prop];
    // If it's a signal, set .value; otherwise set directly
    if (signal?.value !== undefined) {
      signal.value = val;
    } else {
      target[prop] = val;
    }
    return true;
  }
});

window.state = stateProxy;
window.stateSignals = state; // Keep raw signals accessible if needed
window.config = config;

export { state, config };
