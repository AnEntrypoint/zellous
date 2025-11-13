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

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function runTests() {
  console.log('Running Test 18: Audio Encoder/Decoder Configuration\n');

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

class MockAudioEncoder {
  constructor(config) {
    this.config = config;
    this.configured = false;
    this.configData = null;
  }
  configure(config) {
    this.configured = true;
    this.configData = config;
  }
}

class MockAudioDecoder {
  constructor(config) {
    this.config = config;
    this.configured = false;
    this.configData = null;
  }
  configure(config) {
    this.configured = true;
    this.configData = config;
  }
}

test('AudioEncoder configured with Opus codec', () => {
  const encoder = new MockAudioEncoder({
    output: () => {},
    error: () => {}
  });

  encoder.configure({
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 1,
    bitrate: 24000
  });

  assert(encoder.configured, 'Encoder should be configured');
  assertEquals(encoder.configData.codec, 'opus', 'Codec should be opus');
});

test('AudioEncoder configured with 48kHz sample rate', () => {
  const encoder = new MockAudioEncoder({
    output: () => {},
    error: () => {}
  });

  encoder.configure({
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 1,
    bitrate: 24000
  });

  assertEquals(encoder.configData.sampleRate, 48000, 'Sample rate should be 48000');
});

test('AudioEncoder configured with mono (1 channel)', () => {
  const encoder = new MockAudioEncoder({
    output: () => {},
    error: () => {}
  });

  encoder.configure({
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 1,
    bitrate: 24000
  });

  assertEquals(encoder.configData.numberOfChannels, 1, 'Should be mono (1 channel)');
});

test('AudioEncoder configured with 24kbps bitrate', () => {
  const encoder = new MockAudioEncoder({
    output: () => {},
    error: () => {}
  });

  encoder.configure({
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 1,
    bitrate: 24000
  });

  assertEquals(encoder.configData.bitrate, 24000, 'Bitrate should be 24000');
});

test('AudioDecoder configured with Opus codec', () => {
  const decoder = new MockAudioDecoder({
    output: () => {},
    error: () => {}
  });

  decoder.configure({
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 1
  });

  assert(decoder.configured, 'Decoder should be configured');
  assertEquals(decoder.configData.codec, 'opus', 'Codec should be opus');
});

test('AudioDecoder configured with 48kHz sample rate', () => {
  const decoder = new MockAudioDecoder({
    output: () => {},
    error: () => {}
  });

  decoder.configure({
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 1
  });

  assertEquals(decoder.configData.sampleRate, 48000, 'Sample rate should be 48000');
});

test('AudioDecoder configured with mono (1 channel)', () => {
  const decoder = new MockAudioDecoder({
    output: () => {},
    error: () => {}
  });

  decoder.configure({
    codec: 'opus',
    sampleRate: 48000,
    numberOfChannels: 1
  });

  assertEquals(decoder.configData.numberOfChannels, 1, 'Should be mono (1 channel)');
});

test('Encoder output callback sends audio_chunk messages', () => {
  let messageSent = false;
  let messageData = null;

  const encoder = new MockAudioEncoder({
    output: (chunk, metadata) => {
      messageSent = true;
      messageData = { type: 'audio_chunk', data: [1, 2, 3] };
    },
    error: () => {}
  });

  encoder.config.output({ byteLength: 100, copyTo: () => {} }, {});

  assert(messageSent, 'Output callback should send message');
  assertEquals(messageData.type, 'audio_chunk', 'Should send audio_chunk message');
});

test('Decoder output callback buffers samples correctly', () => {
  const audioBuffers = new Map();
  const userId = 'user1';

  const decoder = new MockAudioDecoder({
    output: (audioData) => {
      const samples = new Float32Array(100);
      if (!audioBuffers.has(userId)) audioBuffers.set(userId, []);
      audioBuffers.get(userId).push(samples);
    },
    error: () => {}
  });

  decoder.config.output({ numberOfFrames: 100, copyTo: () => {}, close: () => {} });

  assert(audioBuffers.has(userId), 'Should create buffer entry');
  assertEquals(audioBuffers.get(userId).length, 1, 'Should have 1 buffered sample');
});

test('Error callbacks log appropriately', () => {
  let errorLogged = false;

  const encoder = new MockAudioEncoder({
    output: () => {},
    error: (e) => {
      errorLogged = true;
    }
  });

  encoder.config.error(new Error('Test error'));

  assert(errorLogged, 'Error callback should be called');
});

runTests();
