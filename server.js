import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(__dirname));

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
  },
  audio_chunk: (client, msg) => {
    broadcast({ type: 'audio_data', userId: client.id, data: msg.data }, null, client.roomId);
  },
  audio_end: (client) => {
    client.speaking = false;
    broadcast({ type: 'speaker_left', userId: client.id, user: client.username }, null, client.roomId);
  },
  set_username: (client, msg) => {
    client.username = msg.username;
    broadcast({ type: 'user_updated', userId: client.id, username: msg.username }, null, client.roomId);
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

server.listen(3000, () => {
  console.log('Zellous server running on http://localhost:3000');
});
