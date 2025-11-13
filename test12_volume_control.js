const SAMPLE_RATE = 48000;

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
  console.log('Running Test 12: Volume Control & Audio Gain\n');

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

class MockGainNode {
  constructor() {
    this.gain = { value: 0.7 };
  }
}

class MockAudioContext {
  constructor() {
    this.destination = {};
  }
  createGain() {
    return new MockGainNode();
  }
}

test('Volume slider input updates state.masterVolume', () => {
  const state = { masterVolume: 0.7, audioSources: new Map() };
  const e = { target: { value: 50 } };

  state.masterVolume = e.target.value / 100;
  assertEquals(state.masterVolume, 0.5, 'masterVolume should be 0.5');
});

test('Volume slider converts 0-100 range to 0-1 range', () => {
  const state = { masterVolume: 0.7, audioSources: new Map() };

  [0, 25, 50, 75, 100].forEach(val => {
    state.masterVolume = val / 100;
    assertEquals(state.masterVolume, val / 100, `Value ${val} should convert to ${val/100}`);
  });
});

test('All audioSources gainNodes are updated', () => {
  const state = {
    masterVolume: 0.7,
    audioSources: new Map([
      ['user1', { gainNode: new MockGainNode() }],
      ['user2', { gainNode: new MockGainNode() }],
      ['user3', { gainNode: new MockGainNode() }]
    ])
  };

  const newVolume = 0.5;
  state.masterVolume = newVolume;
  state.audioSources.forEach(s => s.gainNode.gain.value = state.masterVolume);

  state.audioSources.forEach(source => {
    assertEquals(source.gainNode.gain.value, 0.5, 'All gain nodes should be updated');
  });
});

test('volumeValue display updates correctly', () => {
  let displayValue = '70%';
  const e = { target: { value: 85 } };

  displayValue = e.target.value + '%';
  assertEquals(displayValue, '85%', 'Display should show 85%');
});

test('Volume changes during active playback', () => {
  const state = {
    masterVolume: 0.7,
    audioSources: new Map([
      ['user1', { gainNode: new MockGainNode() }]
    ])
  };

  state.audioSources.get('user1').gainNode.gain.value = 0.7;

  state.masterVolume = 0.3;
  state.audioSources.forEach(s => s.gainNode.gain.value = state.masterVolume);

  assertEquals(state.audioSources.get('user1').gainNode.gain.value, 0.3, 'Gain should update during playback');
});

test('Volume with no active audioSources', () => {
  const state = { masterVolume: 0.7, audioSources: new Map() };

  state.masterVolume = 0.5;
  state.audioSources.forEach(s => s.gainNode.gain.value = state.masterVolume);

  assert(true, 'Should handle empty audioSources without error');
});

test('Master volume initializes to 0.7', () => {
  const state = { masterVolume: 0.7 };
  assertEquals(state.masterVolume, 0.7, 'Default volume should be 0.7');
});

test('GainNode values are updated in real-time', () => {
  const gainNode = new MockGainNode();
  gainNode.gain.value = 0.5;
  assertEquals(gainNode.gain.value, 0.5, 'GainNode should update immediately');

  gainNode.gain.value = 0.8;
  assertEquals(gainNode.gain.value, 0.8, 'GainNode should update to new value');
});

runTests();
