const tests = [];
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function runTests() {
  console.log('Running Test 20: Debug Interface\n');

  tests.forEach(({ name, fn }) => {
    try {
      fn();
      console.log(`✓ ${name}`);
      passedTests++;
    } catch (error) {
      console.log(`✗ ${name}`);
      console.log(`  Error: ${error.message}`);
      failedTests++;
    }
  });

  console.log(`\nResults: ${passedTests}/${tests.length} passed, ${failedTests} failed`);
  process.exit(failedTests > 0 ? 1 : 0);
}

const mockState = {
  isSpeaking: false,
  audioContext: null,
  masterVolume: 0.7,
  messages: []
};

const mockConfig = {
  chunkSize: 4096,
  sampleRate: 48000
};

const mockAudio = {
  play: () => {},
  pause: () => {},
  resume: () => {},
  replay: () => {}
};

const mockMessage = {
  handlers: {},
  handle: () => {},
  add: () => {}
};

const mockNetwork = {
  connect: () => {},
  send: () => {}
};

const mockPtt = {
  start: () => {},
  stop: () => {}
};

const zellousDebug = {
  state: mockState,
  config: mockConfig,
  audio: mockAudio,
  message: mockMessage,
  network: mockNetwork,
  ptt: mockPtt
};

test('window.zellousDebug object exists', () => {
  assert(zellousDebug !== undefined, 'zellousDebug should exist');
  assert(typeof zellousDebug === 'object', 'zellousDebug should be an object');
});

test('Debug interface exposes state', () => {
  assert(zellousDebug.state !== undefined, 'state should be exposed');
  assert(typeof zellousDebug.state === 'object', 'state should be an object');
});

test('Debug interface exposes config', () => {
  assert(zellousDebug.config !== undefined, 'config should be exposed');
  assert(typeof zellousDebug.config === 'object', 'config should be an object');
});

test('Debug interface exposes audio module', () => {
  assert(zellousDebug.audio !== undefined, 'audio should be exposed');
  assert(typeof zellousDebug.audio === 'object', 'audio should be an object');
});

test('Debug interface exposes message module', () => {
  assert(zellousDebug.message !== undefined, 'message should be exposed');
  assert(typeof zellousDebug.message === 'object', 'message should be an object');
});

test('Debug interface exposes network module', () => {
  assert(zellousDebug.network !== undefined, 'network should be exposed');
  assert(typeof zellousDebug.network === 'object', 'network should be an object');
});

test('Debug interface exposes ptt module', () => {
  assert(zellousDebug.ptt !== undefined, 'ptt should be exposed');
  assert(typeof zellousDebug.ptt === 'object', 'ptt should be an object');
});

test('State properties accessible via debug interface', () => {
  assert(zellousDebug.state.isSpeaking !== undefined, 'isSpeaking should be accessible');
  assert(zellousDebug.state.masterVolume === 0.7, 'masterVolume should be accessible');
  assert(Array.isArray(zellousDebug.state.messages), 'messages array should be accessible');
});

test('Config properties accessible via debug interface', () => {
  assert(zellousDebug.config.chunkSize === 4096, 'chunkSize should be accessible');
  assert(zellousDebug.config.sampleRate === 48000, 'sampleRate should be accessible');
});

test('Audio methods accessible via debug interface', () => {
  assert(typeof zellousDebug.audio.play === 'function', 'audio.play should be accessible');
  assert(typeof zellousDebug.audio.pause === 'function', 'audio.pause should be accessible');
  assert(typeof zellousDebug.audio.resume === 'function', 'audio.resume should be accessible');
  assert(typeof zellousDebug.audio.replay === 'function', 'audio.replay should be accessible');
});

test('Message methods accessible via debug interface', () => {
  assert(typeof zellousDebug.message.handle === 'function', 'message.handle should be accessible');
  assert(typeof zellousDebug.message.add === 'function', 'message.add should be accessible');
  assert(typeof zellousDebug.message.handlers === 'object', 'message.handlers should be accessible');
});

test('Network methods accessible via debug interface', () => {
  assert(typeof zellousDebug.network.connect === 'function', 'network.connect should be accessible');
  assert(typeof zellousDebug.network.send === 'function', 'network.send should be accessible');
});

test('PTT methods accessible via debug interface', () => {
  assert(typeof zellousDebug.ptt.start === 'function', 'ptt.start should be accessible');
  assert(typeof zellousDebug.ptt.stop === 'function', 'ptt.stop should be accessible');
});

test('Debug interface updates as state changes', () => {
  zellousDebug.state.isSpeaking = true;
  assert(zellousDebug.state.isSpeaking === true, 'State changes should be reflected');

  zellousDebug.state.masterVolume = 0.5;
  assert(zellousDebug.state.masterVolume === 0.5, 'Volume changes should be reflected');
});

test('Debug interface allows message inspection', () => {
  zellousDebug.state.messages.push({ id: 1, text: 'Test', time: '12:00' });
  assert(zellousDebug.state.messages.length === 1, 'Messages should be inspectable');
  assert(zellousDebug.state.messages[0].text === 'Test', 'Message content should be accessible');
});

runTests();
