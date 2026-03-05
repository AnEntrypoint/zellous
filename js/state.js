import { signal } from '@preact/signals';

const getRoomFromURL = () => new URLSearchParams(window.location.search).get('room') || 'lobby';
const config = { chunkSize: 4096, sampleRate: 48000 };

const state = {
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

  vadEnabled: signal(false),
  vadThreshold: signal(0.15),
  vadSilenceDelay: signal(1500),
  vadSilenceTimer: signal(null),
  vadAnalyser: signal(null),

  webcamEnabled: signal(false),
  webcamStream: signal(null),
  webcamRecorder: signal(null),
  webcamResolution: signal('320x240'),
  webcamFps: signal(15),
  ownVideoChunks: signal([]),
  incomingVideoChunks: signal(null),
  liveVideoChunks: signal(null),
  liveVideoInterval: signal(null),

  inputDeviceId: signal(null),
  outputDeviceId: signal(null),
  inputDevices: signal([]),
  outputDevices: signal([]),

  chatMessages: signal([]),
  chatInputValue: signal(''),

  isAuthenticated: signal(false),
  currentUser: signal(null),

  currentFilePath: signal(''),
  fileList: signal([]),

  activePanel: signal('main'),
  showAuthModal: signal(false),
  showSettingsModal: signal(false),

  isConnected: signal(false),
  connectionStatus: signal('Connecting...'),

  users: signal(new Map()),

  currentChannel: signal({ id: 'general', type: 'text', name: 'general' }),
  channels: signal([]),
  categories: signal([]),
  collapsedCategories: signal(new Set()),

  voiceConnected: signal(false),
  voiceChannelName: signal(''),
  voiceParticipants: signal([]),
  livekitRoom: signal(null),
  micMuted: signal(false),

  voiceConnectionQuality: signal('unknown'),
  voiceConnectionState: signal('disconnected'),
  voiceReconnectAttempts: signal(0),

  dataChannelAvailable: signal(false),
  useDataChannel: signal(false),

  voiceDeafened: signal(false),

  roomMembers: signal([]),

  membersVisible: signal(true),
  queueVisible: signal(true),
  settingsOpen: signal(false),

  servers: signal([]),
  currentServerId: signal(null),
};

const _isSignal = (v) => v !== null && typeof v === 'object' && 'value' in v && typeof v.subscribe === 'function';

const stateProxy = new Proxy(state, {
  get: (target, prop) => {
    const entry = target[prop];
    if (_isSignal(entry)) return entry.value;
    return entry;
  },
  set: (target, prop, val) => {
    const entry = target[prop];
    if (_isSignal(entry)) {
      entry.value = val;
    } else {
      target[prop] = val;
    }
    return true;
  }
});

window.state = stateProxy;
window.stateSignals = state;
window.config = config;

export { state, config };
