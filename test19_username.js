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

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

async function runTests() {
  console.log('Running Test 19: Username Management\n');

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
    },
    set_username: (client, msg) => {
      client.username = msg.username;
      broadcast({ type: 'user_updated', userId: client.id, username: msg.username }, null, client.roomId);
    },
    audio_start: (client) => {
      client.speaking = true;
      broadcast({ type: 'speaker_joined', user: client.username, userId: client.id }, null, client.roomId);
    },
    audio_end: (client) => {
      client.speaking = false;
      broadcast({ type: 'speaker_left', userId: client.id, user: client.username }, null, client.roomId);
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

test('set_username updates client.username', () => {
  return new Promise((resolve) => {
    const { server, wss, state } = createTestServer();
    server.listen(0, () => {
      const port = server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'set_username', username: 'Alice' }));

        setTimeout(() => {
          const client = Array.from(state.clients.values())[0];
          assertEquals(client.username, 'Alice', 'Username should be updated to Alice');
          ws.close();
          server.close();
          resolve();
        }, 50);
      });
    });
  });
});

test('user_updated broadcast sent to correct room', () => {
  return new Promise((resolve) => {
    const { server, wss, state } = createTestServer();
    server.listen(0, () => {
      const port = server.address().port;
      const updater = new WebSocket(`ws://localhost:${port}`);
      const roommate = new WebSocket(`ws://localhost:${port}`);
      const otherRoom = new WebSocket(`ws://localhost:${port}`);

      let roommateMessages = [];
      let otherRoomMessages = [];

      roommate.on('message', (data) => roommateMessages.push(JSON.parse(data.toString())));
      otherRoom.on('message', (data) => otherRoomMessages.push(JSON.parse(data.toString())));

      Promise.all([
        new Promise(r => updater.on('open', r)),
        new Promise(r => roommate.on('open', r)),
        new Promise(r => otherRoom.on('open', r))
      ]).then(() => {
        updater.send(JSON.stringify({ type: 'join_room', roomId: 'team1' }));
        roommate.send(JSON.stringify({ type: 'join_room', roomId: 'team1' }));
        otherRoom.send(JSON.stringify({ type: 'join_room', roomId: 'team2' }));

        setTimeout(() => {
          roommateMessages = [];
          otherRoomMessages = [];

          updater.send(JSON.stringify({ type: 'set_username', username: 'Bob' }));

          setTimeout(() => {
            const roommateUpdates = roommateMessages.filter(m => m.type === 'user_updated');
            const otherRoomUpdates = otherRoomMessages.filter(m => m.type === 'user_updated');

            assert(roommateUpdates.length === 1, 'Roommate should receive update');
            assert(otherRoomUpdates.length === 0, 'Other room should NOT receive update');

            updater.close();
            roommate.close();
            otherRoom.close();
            server.close();
            resolve();
          }, 50);
        }, 50);
      });
    });
  });
});

test('Username in speaker_joined message', () => {
  return new Promise((resolve) => {
    const { server, wss, state } = createTestServer();
    server.listen(0, () => {
      const port = server.address().port;
      const speaker = new WebSocket(`ws://localhost:${port}`);
      const listener = new WebSocket(`ws://localhost:${port}`);

      let listenerMessages = [];
      listener.on('message', (data) => listenerMessages.push(JSON.parse(data.toString())));

      Promise.all([
        new Promise(r => speaker.on('open', r)),
        new Promise(r => listener.on('open', r))
      ]).then(() => {
        speaker.send(JSON.stringify({ type: 'join_room', roomId: 'test' }));
        listener.send(JSON.stringify({ type: 'join_room', roomId: 'test' }));

        setTimeout(() => {
          speaker.send(JSON.stringify({ type: 'set_username', username: 'Charlie' }));

          setTimeout(() => {
            listenerMessages = [];
            speaker.send(JSON.stringify({ type: 'audio_start' }));

            setTimeout(() => {
              const speakerJoined = listenerMessages.find(m => m.type === 'speaker_joined');
              assert(speakerJoined !== undefined, 'Should receive speaker_joined');
              assertEquals(speakerJoined.user, 'Charlie', 'Username should be Charlie');

              speaker.close();
              listener.close();
              server.close();
              resolve();
            }, 50);
          }, 50);
        }, 50);
      });
    });
  });
});

test('Default username (User{id}) on connection', () => {
  return new Promise((resolve) => {
    const { server, wss, state } = createTestServer();
    server.listen(0, () => {
      const port = server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('open', () => {
        setTimeout(() => {
          const client = Array.from(state.clients.values())[0];
          assertEquals(client.username, 'User1', 'Default username should be User1');
          ws.close();
          server.close();
          resolve();
        }, 50);
      });
    });
  });
});

test('Empty username handling', () => {
  return new Promise((resolve) => {
    const { server, wss, state } = createTestServer();
    server.listen(0, () => {
      const port = server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'set_username', username: '' }));

        setTimeout(() => {
          const client = Array.from(state.clients.values())[0];
          assertEquals(client.username, '', 'Empty username should be allowed');
          ws.close();
          server.close();
          resolve();
        }, 50);
      });
    });
  });
});

test('Null username handling', () => {
  return new Promise((resolve) => {
    const { server, wss, state } = createTestServer();
    server.listen(0, () => {
      const port = server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'set_username', username: null }));

        setTimeout(() => {
          const client = Array.from(state.clients.values())[0];
          assert(client.username === null, 'Null username should be set');
          ws.close();
          server.close();
          resolve();
        }, 50);
      });
    });
  });
});

runTests();
