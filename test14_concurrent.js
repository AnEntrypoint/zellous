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
  console.log('Running Test 14: Concurrent Users & Performance\n');

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

  const state = {
    clients: new Map(),
    counter: 0
  };

  const createClient = (ws, id) => ({
    id,
    ws,
    username: `User${id}`,
    speaking: false,
    roomId: 'lobby'
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
      broadcast({ type: 'user_joined', user: client.username, userId: client.id }, client, client.roomId);
    },
    audio_chunk: (client, msg) => {
      broadcast({ type: 'audio_data', userId: client.id, data: msg.data }, client, client.roomId);
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
      } catch (err) {
        console.error('Error:', err.message);
      }
    });

    ws.send(JSON.stringify({ type: 'connection_established', clientId }));
  });

  return { server, wss, state };
}

test('20 concurrent clients across 5 rooms', () => {
  return new Promise((resolve, reject) => {
    const { server, wss, state } = createTestServer();

    server.listen(0, () => {
      const port = server.address().port;
      const clients = [];
      const rooms = ['room1', 'room2', 'room3', 'room4', 'room5'];

      for (let i = 0; i < 20; i++) {
        const ws = new WebSocket(`ws://localhost:${port}`);
        const roomId = rooms[i % 5];
        clients.push({ ws, roomId });
      }

      Promise.all(clients.map(c => new Promise(r => c.ws.on('open', r)))).then(() => {
        clients.forEach(({ ws, roomId }) => {
          ws.send(JSON.stringify({ type: 'join_room', roomId }));
        });

        setTimeout(() => {
          assert(state.clients.size === 20, 'Should have 20 concurrent clients');

          const roomCounts = {};
          Array.from(state.clients.values()).forEach(c => {
            roomCounts[c.roomId] = (roomCounts[c.roomId] || 0) + 1;
          });

          Object.values(roomCounts).forEach(count => {
            assert(count === 4, 'Each room should have 4 clients');
          });

          clients.forEach(c => c.ws.close());
          server.close();
          resolve();
        }, 100);
      });
    });
  });
});

test('1000 audio chunks rapidly sent', () => {
  return new Promise((resolve, reject) => {
    const { server, wss, state } = createTestServer();

    server.listen(0, () => {
      const port = server.address().port;
      const sender = new WebSocket(`ws://localhost:${port}`);
      const receiver = new WebSocket(`ws://localhost:${port}`);

      let receivedChunks = 0;

      receiver.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'audio_data') receivedChunks++;
      });

      Promise.all([
        new Promise(r => sender.on('open', r)),
        new Promise(r => receiver.on('open', r))
      ]).then(() => {
        sender.send(JSON.stringify({ type: 'join_room', roomId: 'test' }));
        receiver.send(JSON.stringify({ type: 'join_room', roomId: 'test' }));

        setTimeout(() => {
          for (let i = 0; i < 1000; i++) {
            sender.send(JSON.stringify({
              type: 'audio_chunk',
              data: new Array(100).fill(i % 256)
            }));
          }

          setTimeout(() => {
            assert(receivedChunks === 1000, `Should receive all 1000 chunks, got ${receivedChunks}`);
            sender.close();
            receiver.close();
            server.close();
            resolve();
          }, 500);
        }, 50);
      });
    });
  });
});

test('Message routing performance (O(1) handler lookup)', () => {
  const handlers = {
    join_room: () => {},
    audio_start: () => {},
    audio_chunk: () => {},
    audio_end: () => {},
    set_username: () => {}
  };

  const messageTypes = Object.keys(handlers);
  const iterations = 100000;

  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    const type = messageTypes[i % messageTypes.length];
    const handler = handlers[type];
    if (handler) handler();
  }
  const end = process.hrtime.bigint();

  const timeMs = Number(end - start) / 1000000;
  assert(timeMs < 100, `Handler lookup should be fast (took ${timeMs.toFixed(2)}ms for ${iterations} iterations)`);

  return Promise.resolve();
});

test('No message loss with concurrent speakers', () => {
  return new Promise((resolve, reject) => {
    const { server, wss, state } = createTestServer();

    server.listen(0, () => {
      const port = server.address().port;
      const speaker1 = new WebSocket(`ws://localhost:${port}`);
      const speaker2 = new WebSocket(`ws://localhost:${port}`);
      const listener = new WebSocket(`ws://localhost:${port}`);

      let receivedFromSpeaker1 = 0;
      let receivedFromSpeaker2 = 0;

      listener.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'audio_data') {
          if (msg.userId === 1) receivedFromSpeaker1++;
          if (msg.userId === 2) receivedFromSpeaker2++;
        }
      });

      Promise.all([
        new Promise(r => speaker1.on('open', r)),
        new Promise(r => speaker2.on('open', r)),
        new Promise(r => listener.on('open', r))
      ]).then(() => {
        speaker1.send(JSON.stringify({ type: 'join_room', roomId: 'test' }));
        speaker2.send(JSON.stringify({ type: 'join_room', roomId: 'test' }));
        listener.send(JSON.stringify({ type: 'join_room', roomId: 'test' }));

        setTimeout(() => {
          for (let i = 0; i < 50; i++) {
            speaker1.send(JSON.stringify({ type: 'audio_chunk', data: [i] }));
            speaker2.send(JSON.stringify({ type: 'audio_chunk', data: [i] }));
          }

          setTimeout(() => {
            assert(receivedFromSpeaker1 === 50, `Should receive 50 from speaker1, got ${receivedFromSpeaker1}`);
            assert(receivedFromSpeaker2 === 50, `Should receive 50 from speaker2, got ${receivedFromSpeaker2}`);

            speaker1.close();
            speaker2.close();
            listener.close();
            server.close();
            resolve();
          }, 200);
        }, 50);
      });
    });
  });
});

runTests();
