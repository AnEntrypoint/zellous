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
  console.log('Running Test 13: Client Disconnect Handling\n');

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
      const roomClients = Array.from(state.clients.values()).filter(c => c.roomId === client.roomId && c !== client);
      client.ws.send(JSON.stringify({
        type: 'room_joined',
        roomId: client.roomId,
        currentUsers: roomClients.map(c => ({ id: c.id, username: c.username }))
      }));
      broadcast({ type: 'user_joined', user: client.username, userId: client.id }, client, client.roomId);
    },
    audio_start: (client) => {
      client.speaking = true;
      broadcast({ type: 'speaker_joined', user: client.username, userId: client.id }, null, client.roomId);
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

    ws.on('close', () => {
      const roomId = client.roomId;
      state.clients.delete(ws);
      broadcast({ type: 'user_left', userId: clientId }, null, roomId);
    });

    ws.send(JSON.stringify({
      type: 'connection_established',
      clientId
    }));
  });

  return { server, wss, state };
}

test('Client removed from state.clients Map on disconnect', () => {
  return new Promise((resolve, reject) => {
    const { server, wss, state } = createTestServer();

    server.listen(0, () => {
      const port = server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('open', () => {
        assert(state.clients.size === 1, 'Client should be in map');
        ws.close();
      });

      ws.on('close', () => {
        setTimeout(() => {
          assert(state.clients.size === 0, 'Client should be removed from map');
          server.close();
          resolve();
        }, 50);
      });

      ws.on('error', reject);
    });
  });
});

test('user_left broadcast sent to correct room only', () => {
  return new Promise((resolve, reject) => {
    const { server, wss, state } = createTestServer();

    server.listen(0, () => {
      const port = server.address().port;
      const ws1 = new WebSocket(`ws://localhost:${port}`);
      const ws2 = new WebSocket(`ws://localhost:${port}`);
      const ws3 = new WebSocket(`ws://localhost:${port}`);

      let ws1Messages = [];
      let ws2Messages = [];
      let ws3Messages = [];

      ws1.on('message', (data) => ws1Messages.push(JSON.parse(data.toString())));
      ws2.on('message', (data) => ws2Messages.push(JSON.parse(data.toString())));
      ws3.on('message', (data) => ws3Messages.push(JSON.parse(data.toString())));

      Promise.all([
        new Promise(r => ws1.on('open', r)),
        new Promise(r => ws2.on('open', r)),
        new Promise(r => ws3.on('open', r))
      ]).then(() => {
        ws1.send(JSON.stringify({ type: 'join_room', roomId: 'room1' }));
        ws2.send(JSON.stringify({ type: 'join_room', roomId: 'room1' }));
        ws3.send(JSON.stringify({ type: 'join_room', roomId: 'room2' }));

        setTimeout(() => {
          ws1Messages = [];
          ws2Messages = [];
          ws3Messages = [];

          ws1.close();

          setTimeout(() => {
            const ws2UserLeft = ws2Messages.filter(m => m.type === 'user_left');
            const ws3UserLeft = ws3Messages.filter(m => m.type === 'user_left');

            assert(ws2UserLeft.length === 1, 'Room1 client should receive user_left');
            assert(ws3UserLeft.length === 0, 'Room2 client should NOT receive user_left');

            server.close();
            resolve();
          }, 50);
        }, 50);
      });
    });
  });
});

test('Disconnect during active speaking', () => {
  return new Promise((resolve, reject) => {
    const { server, wss, state } = createTestServer();

    server.listen(0, () => {
      const port = server.address().port;
      const ws = new WebSocket(`ws://localhost:${port}`);

      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'join_room', roomId: 'lobby' }));
        ws.send(JSON.stringify({ type: 'audio_start' }));

        setTimeout(() => {
          const client = Array.from(state.clients.values())[0];
          assert(client.speaking === true, 'Client should be speaking');
          ws.close();
        }, 50);
      });

      ws.on('close', () => {
        setTimeout(() => {
          assert(state.clients.size === 0, 'Client should be removed even while speaking');
          server.close();
          resolve();
        }, 50);
      });
    });
  });
});

test('No memory leaks from disconnected clients', () => {
  return new Promise((resolve, reject) => {
    const { server, wss, state } = createTestServer();

    server.listen(0, () => {
      const port = server.address().port;
      const clients = [];

      for (let i = 0; i < 10; i++) {
        clients.push(new WebSocket(`ws://localhost:${port}`));
      }

      Promise.all(clients.map(ws => new Promise(r => ws.on('open', r)))).then(() => {
        assert(state.clients.size === 10, 'Should have 10 clients');

        clients.forEach(ws => ws.close());

        setTimeout(() => {
          assert(state.clients.size === 0, 'All clients should be removed');
          server.close();
          resolve();
        }, 100);
      });
    });
  });
});

runTests();
