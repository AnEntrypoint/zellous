const getRoomFromURL = () => new URLSearchParams(window.location.search).get('room') || 'lobby';
const config = { chunkSize: 4096, sampleRate: 48000 };
const state = {
  // Audio state
  isSpeaking: false, audioContext: null, mediaStream: null, scriptProcessor: null,
  audioBuffers: new Map(), audioSources: new Map(), playbackState: new Map(),
  pausedAudioBuffer: null, pausedBuffers: null, masterVolume: 0.7,
  activeSpeakers: new Set(), messages: [], audioHistory: new Map(), recordingAudio: new Map(),
  audioEncoder: null, audioDecoders: new Map(), scheduledPlaybackTime: new Map(),
  ws: null, userId: null, roomId: getRoomFromURL(),
  audioQueue: [], activeSegments: new Map(), currentSegmentId: null, replayingSegmentId: null,
  replayGainNode: null, replayTimeout: null, skipLiveAudio: false, currentLiveSpeaker: null,
  isDeafened: false, nextSegmentId: 1, ownAudioChunks: [],

  // VAD state
  vadEnabled: false, vadThreshold: 0.15, vadSilenceDelay: 1500, vadSilenceTimer: null, vadAnalyser: null,

  // Webcam state
  webcamEnabled: false, webcamStream: null, webcamRecorder: null, webcamResolution: '320x240', webcamFps: 15,
  ownVideoChunks: [], incomingVideoChunks: null, liveVideoChunks: null, liveVideoInterval: null,

  // Device state
  inputDeviceId: null, outputDeviceId: null,

  // Chat state (text messaging)
  chatMessages: [],
  chatInputValue: '',

  // Auth state
  isAuthenticated: false,
  currentUser: null,

  // File browser state
  currentFilePath: '',
  fileList: [],

  // UI state
  activePanel: 'main', // main, chat, files, settings
  showAuthModal: false,
  showSettingsModal: false
};

window.state = state;
window.config = config;
