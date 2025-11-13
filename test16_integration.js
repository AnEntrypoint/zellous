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
  console.log('Running Test 16: Integration - Full Audio Flow\n');

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
    },
    audio_chunk: (client, msg) => {
      broadcast({ type: 'audio_data', userId: client.id, data: msg.data }, client, client.roomId);
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

test('Full audio flow: Client1 sends, Client2 receives', () => {
  return new Promise((resolve) => {
    const { server, wss, state } = createTestServer();
    server.listen(0, () => {
      const port = server.address().port;
      const client1 = new WebSocket(`ws://localhost:${port}`);
      const client2 = new WebSocket(`ws://localhost:${port}`);

      let client2Messages = [];
      client2.on('message', (data) => client2Messages.push(JSON.parse(data.toString())));

      Promise.all([
        new Promise(r => client1.on('open', r)),
        new Promise(r => client2.on('open', r))
      ]).then(() => {
        client1.send(JSON.stringify({ type: 'join_room', roomId: 'test' }));
        client2.send(JSON.stringify({ type: 'join_room', roomId: 'test' }));

        setTimeout(() => {
          client2Messages = [];

          client1.send(JSON.stringify({ type: 'audio_start' }));

          setTimeout(() => {
            for (let i = 0; i < 5; i++) {
              client1.send(JSON.stringify({ type: 'audio_chunk', data: new Array(100).fill(i) }));
            }

            setTimeout(() => {
              client1.send(JSON.stringify({ type: 'audio_end' }));

              setTimeout(() => {
                const speakerJoined = client2Messages.filter(m => m.type === 'speaker_joined');
                const audioData = client2Messages.filter(m => m.type === 'audio_data');
                const speakerLeft = client2Messages.filter(m => m.type === 'speaker_left');

                assert(speakerJoined.length === 1, 'Client2 should receive speaker_joined');
                assert(audioData.length === 5, 'Client2 should receive 5 audio chunks');
                assert(speakerLeft.length === 1, 'Client2 should receive speaker_left');

                client1.close();
                client2.close();
                server.close();
                resolve();
              }, 50);
            }, 50);
          }, 50);
        }, 50);
      });
    });
  });
});

test('Audio chunk data integrity preserved', () => {
  return new Promise((resolve) => {
    const { server, wss, state } = createTestServer();
    server.listen(0, () => {
      const port = server.address().port;
      const sender = new WebSocket(`ws://localhost:${port}`);
      const receiver = new WebSocket(`ws://localhost:${port}`);

      const testData = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      let receivedData = null;

      receiver.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'audio_data') {
          receivedData = msg.data;
        }
      });

      Promise.all([
        new Promise(r => sender.on('open', r)),
        new Promise(r => receiver.on('open', r))
      ]).then(() => {
        sender.send(JSON.stringify({ type: 'join_room', roomId: 'test' }));
        receiver.send(JSON.stringify({ type: 'join_room', roomId: 'test' }));

        setTimeout(() => {
          sender.send(JSON.stringify({ type: 'audio_chunk', data: testData }));

          setTimeout(() => {
            assert(receivedData !== null, 'Should receive audio data');
            assert(JSON.stringify(receivedData) === JSON.stringify(testData), 'Audio data should be preserved');

            sender.close();
            receiver.close();
            server.close();
            resolve();
          }, 50);
        }, 50);
      });
    });
  });
});

test('Multiple clients receive same audio', () => {
  return new Promise((resolve) => {
    const { server, wss, state } = createTestServer();
    server.listen(0, () => {
      const port = server.address().port;
      const sender = new WebSocket(`ws://localhost:${port}`);
      const receiver1 = new WebSocket(`ws://localhost:${port}`);
      const receiver2 = new WebSocket(`ws://localhost:${port}`);
      const receiver3 = new WebSocket(`ws://localhost:${port}`);

      let r1Count = 0, r2Count = 0, r3Count = 0;

      receiver1.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'audio_data') r1Count++;
      });
      receiver2.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'audio_data') r2Count++;
      });
      receiver3.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'audio_data') r3Count++;
      });

      Promise.all([
        new Promise(r => sender.on('open', r)),
        new Promise(r => receiver1.on('open', r)),
        new Promise(r => receiver2.on('open', r)),
        new Promise(r => receiver3.on('open', r))
      ]).then(() => {
        [sender, receiver1, receiver2, receiver3].forEach(ws => {
          ws.send(JSON.stringify({ type: 'join_room', roomId: 'test' }));
        });

        setTimeout(() => {
          for (let i = 0; i < 10; i++) {
            sender.send(JSON.stringify({ type: 'audio_chunk', data: [i] }));
          }

          setTimeout(() => {
            assert(r1Count === 10, `Receiver1 should get 10 chunks, got ${r1Count}`);
            assert(r2Count === 10, `Receiver2 should get 10 chunks, got ${r2Count}`);
            assert(r3Count === 10, `Receiver3 should get 10 chunks, got ${r3Count}`);

            sender.close();
            receiver1.close();
            receiver2.close();
            receiver3.close();
            server.close();
            resolve();
          }, 100);
        }, 50);
      });
    });
  });
});

test('Room isolation during audio transmission', () => {
  return new Promise((resolve) => {
    const { server, wss, state } = createTestServer();
    server.listen(0, () => {
      const port = server.address().port;
      const roomA_sender = new WebSocket(`ws://localhost:${port}`);
      const roomA_receiver = new WebSocket(`ws://localhost:${port}`);
      const roomB_receiver = new WebSocket(`ws://localhost:${port}`);

      let roomACount = 0, roomBCount = 0;

      roomA_receiver.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'audio_data') roomACount++;
      });
      roomB_receiver.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'audio_data') roomBCount++;
      });

      Promise.all([
        new Promise(r => roomA_sender.on('open', r)),
        new Promise(r => roomA_receiver.on('open', r)),
        new Promise(r => roomB_receiver.on('open', r))
      ]).then(() => {
        roomA_sender.send(JSON.stringify({ type: 'join_room', roomId: 'roomA' }));
        roomA_receiver.send(JSON.stringify({ type: 'join_room', roomId: 'roomA' }));
        roomB_receiver.send(JSON.stringify({ type: 'join_room', roomId: 'roomB' }));

        setTimeout(() => {
          for (let i = 0; i < 10; i++) {
            roomA_sender.send(JSON.stringify({ type: 'audio_chunk', data: [i] }));
          }

          setTimeout(() => {
            assert(roomACount === 10, 'RoomA receiver should get all audio');
            assert(roomBCount === 0, 'RoomB receiver should get NO audio');

            roomA_sender.close();
            roomA_receiver.close();
            roomB_receiver.close();
            server.close();
            resolve();
          }, 100);
        }, 50);
      });
    });
  });
});

runTests();
