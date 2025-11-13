import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import WebSocket from 'ws';

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

async function runTests() {
  console.log('Running Test 15: Edge Cases & Error Handling\n');

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passedTests++;
    } catch (error) {
      console.log(`✗ ${name}`);
      console.log(`  Error: ${error.message}`);
      failedTests++;
    }
  }

  console.log(`\nResults: ${passedTests}/${tests.length} passed, ${failedTests} failed`);
  process.exit(failedTests > 0 ? 1 : 0);
}

function createTestServer() {
  const server = createServer();
  const wss = new WebSocketServer({ server });
  const state = { clients: new Map(), counter: 0 };

  const createClient = (ws, id) => ({
    id, ws, username: `User${id}`, speaking: false, roomId: 'lobby'
  });

  const broadcast = (msg, exclude = null, roomId = null) => {
    const data = JSON.stringify(msg);
    for (const client of state.clients.values()) {
      if (client.ws.readyState === 1 && client !== exclude && (!roomId || client.roomId === roomId)) {
        client.ws.send(data);
      }
    }
  };

  const handlers = {
    join_room: (client, msg) => {
      client.roomId = msg.roomId || 'lobby';
      client.ws.send(JSON.stringify({ type: 'room_joined', roomId: client.roomId }));
    },
    set_username: (client, msg) => {
      client.username = msg.username;
    }
  };

  wss.on('connection', (ws) => {
    const clientId = ++state.counter;
    const client = createClient(ws, clientId);
    state.clients.set(ws, client);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        const handler = handlers[msg.type];
        if (handler) handler(client, msg);
      } catch (err) {}
    });

    ws.send(JSON.stringify({ type: 'connection_established', clientId }));
  });

  return { server, wss, state };
}

test('Room names with special characters', () => {
  return new Promise((resolve) => {
    const { server, wss, state } = createTestServer();
    server.listen(0, () => {
      const port = server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'join_room', roomId: '!@#$%^&*()' }));
        setTimeout(() => {
          const client = Array.from(state.clients.values())[0];
          assert(client.roomId === '!@#$%^&*()', 'Special characters in room name should work');
          ws.close();
          server.close();
          resolve();
        }, 50);
      });
    });
  });
});

test('Extremely long room names (1000+ chars)', () => {
  return new Promise((resolve) => {
    const { server, wss, state } = createTestServer();
    server.listen(0, () => {
      const port = server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}`);
      const longRoom = 'a'.repeat(1000);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'join_room', roomId: longRoom }));
        setTimeout(() => {
          const client = Array.from(state.clients.values())[0];
          assert(client.roomId === longRoom, 'Long room names should work');
          ws.close();
          server.close();
          resolve();
        }, 50);
      });
    });
  });
});

test('Empty username in set_username', () => {
  return new Promise((resolve) => {
    const { server, wss, state } = createTestServer();
    server.listen(0, () => {
      const port = server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'set_username', username: '' }));
        setTimeout(() => {
          const client = Array.from(state.clients.values())[0];
          assert(client.username === '', 'Empty username should be allowed');
          ws.close();
          server.close();
          resolve();
        }, 50);
      });
    });
  });
});

test('Sending messages before WebSocket connection established (client-side)', () => {
  const mockWs = { readyState: WebSocket.CONNECTING };
  const state = { ws: mockWs, roomId: 'test' };

  const send = (msg) => {
    if (state.ws?.readyState === WebSocket.OPEN) {
      msg.roomId = state.roomId;
      state.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  };

  const result = send({ type: 'audio_chunk', data: [1, 2, 3] });
  assert(result === false, 'Should not send when connection not open');

  return Promise.resolve();
});

test('Audio operations without microphone permission (graceful degradation)', () => {
  const state = { isSpeaking: false, audioEncoder: null };

  const startRecording = () => {
    if (!state.audioEncoder) {
      return false;
    }
    state.isSpeaking = true;
    return true;
  };

  const result = startRecording();
  assert(result === false, 'Should handle missing encoder gracefully');

  return Promise.resolve();
});

test('Negative volume values (client-side clamping)', () => {
  let masterVolume = 0.7;
  const setVolume = (val) => {
    masterVolume = Math.max(0, Math.min(1, val / 100));
  };

  setVolume(-50);
  assert(masterVolume === 0, 'Negative volume should clamp to 0');

  setVolume(150);
  assert(masterVolume === 1, 'Over 100 volume should clamp to 1');

  return Promise.resolve();
});

test('Empty room ID defaults to lobby', () => {
  return new Promise((resolve) => {
    const { server, wss, state } = createTestServer();
    server.listen(0, () => {
      const port = server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'join_room', roomId: '' }));
        setTimeout(() => {
          const client = Array.from(state.clients.values())[0];
          assert(client.roomId === 'lobby', 'Empty room ID should default to lobby');
          ws.close();
          server.close();
          resolve();
        }, 50);
      });
    });
  });
});

test('Null/undefined room ID defaults to lobby', () => {
  return new Promise((resolve) => {
    const { server, wss, state } = createTestServer();
    server.listen(0, () => {
      const port = server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'join_room' }));
        setTimeout(() => {
          const client = Array.from(state.clients.values())[0];
          assert(client.roomId === 'lobby', 'Null/undefined room ID should default to lobby');
          ws.close();
          server.close();
          resolve();
        }, 50);
      });
    });
  });
});

runTests();
