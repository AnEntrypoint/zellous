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
  console.log('Running Test 17: Room URL Parsing & Navigation\n');

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

function getRoomFromURL(url) {
  const params = new URLSearchParams(new URL(url).search);
  return params.get('room') || 'lobby';
}

test('http://localhost:3000 → "lobby"', () => {
  const room = getRoomFromURL('http://localhost:3000');
  assertEquals(room, 'lobby', 'No room param should default to lobby');
});

test('http://localhost:3000?room=test → "test"', () => {
  const room = getRoomFromURL('http://localhost:3000?room=test');
  assertEquals(room, 'test', 'Should parse room parameter');
});

test('http://localhost:3000?room= → "lobby"', () => {
  const room = getRoomFromURL('http://localhost:3000?room=');
  assertEquals(room, 'lobby', 'Empty room should default to lobby');
});

test('http://localhost:3000?room=team%201 → "team 1"', () => {
  const room = getRoomFromURL('http://localhost:3000?room=team%201');
  assertEquals(room, 'team 1', 'URL encoded room should be decoded');
});

test('http://localhost:3000?other=param&room=myroom → "myroom"', () => {
  const room = getRoomFromURL('http://localhost:3000?other=param&room=myroom');
  assertEquals(room, 'myroom', 'Should parse room with other params');
});

test('https://example.com:8080?room=secure → "secure"', () => {
  const room = getRoomFromURL('https://example.com:8080?room=secure');
  assertEquals(room, 'secure', 'Should work with https and custom port');
});

test('http://localhost:3000?room=meeting123 → "meeting123"', () => {
  const room = getRoomFromURL('http://localhost:3000?room=meeting123');
  assertEquals(room, 'meeting123', 'Should parse alphanumeric room names');
});

test('http://localhost:3000?room=team-blue → "team-blue"', () => {
  const room = getRoomFromURL('http://localhost:3000?room=team-blue');
  assertEquals(room, 'team-blue', 'Should handle hyphens in room names');
});

test('http://localhost:3000?room=room_1 → "room_1"', () => {
  const room = getRoomFromURL('http://localhost:3000?room=room_1');
  assertEquals(room, 'room_1', 'Should handle underscores in room names');
});

test('http://localhost:3000?ROOM=test → "lobby"', () => {
  const room = getRoomFromURL('http://localhost:3000?ROOM=test');
  assertEquals(room, 'lobby', 'Room param is case-sensitive (ROOM ≠ room)');
});

runTests();
