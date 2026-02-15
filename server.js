import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pack, unpack } from 'msgpackr';
import cors from 'cors';
import logger from '@sequentialos/sequential-logging';

import {
  initialize, rooms, messages, media, files,
  startCleanup, stopCleanup, DATA_ROOT
} from './server/storage.js';
import {
  optionalAuth, requireAuth, authenticateWebSocket,
  register, login, logout, logoutAll,
  getActiveSessions, getDevices, removeDevice,
  updateSettings, updateDisplayName, changePassword
} from './server/auth.js';
import {
  bots, BotConnection, setupBotApiRoutes
} from './server/bot-api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors({
  origin: true, // Allow all origins for iframe embedding
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://os.247420.xyz https://*.247420.xyz http://localhost:* http://127.0.0.1:*");
  next();
});

app.use(express.static(__dirname));
app.use(optionalAuth);


const state = {
  clients: new Map(),
  counter: 0,
  roomUsers: new Map(), // roomId -> Set of client ids
  mediaSessions: new Map() // clientId -> current media session id
};

const createClient = (ws, id, user = null) => ({
  id,
  ws,
  username: user?.displayName || `User${id}`,
  userId: user?.id || null,
  sessionId: null,
  speaking: false,
  roomId: 'lobby',
  isBot: false,
  isAuthenticated: !!user
});


const filterClientsByRoom = (roomId, exclude = null) => {
  return Array.from(state.clients.values())
    .filter(c => c.roomId === roomId && c !== exclude);
};

const broadcast = (msg, exclude = null, roomId = null) => {
  const data = pack(msg);
  const clients = roomId ? filterClientsByRoom(roomId, exclude) : Array.from(state.clients.values()).filter(c => c !== exclude);
  for (const client of clients) {
    if (client.ws.readyState === 1) {
      client.ws.send(data);
    }
  }
};


const joinRoom = async (client, roomId) => {
  const oldRoomId = client.roomId;

  if (oldRoomId && state.roomUsers.has(oldRoomId)) {
    state.roomUsers.get(oldRoomId).delete(client.id);
    if (state.roomUsers.get(oldRoomId).size === 0) {
      state.roomUsers.delete(oldRoomId);
      await rooms.scheduleCleanup(oldRoomId);
    }
  }

  client.roomId = roomId;
  if (!state.roomUsers.has(roomId)) {
    state.roomUsers.set(roomId, new Set());
    await rooms.cancelCleanup(roomId);
  }
  state.roomUsers.get(roomId).add(client.id);

  await rooms.ensureRoom(roomId);
  await rooms.setUserCount(roomId, state.roomUsers.get(roomId).size);
};

const leaveRoom = async (client) => {
  const roomId = client.roomId;
  if (roomId && state.roomUsers.has(roomId)) {
    state.roomUsers.get(roomId).delete(client.id);
    const count = state.roomUsers.get(roomId).size;
    await rooms.setUserCount(roomId, count);

    if (count === 0) {
      state.roomUsers.delete(roomId);
      await rooms.scheduleCleanup(roomId);
    }
  }
};


const handlers = {
  authenticate: async (client, msg) => {
    const auth = await authenticateWebSocket(msg.token);
    if (auth) {
      client.userId = auth.user.id;
      client.username = auth.user.displayName;
      client.sessionId = auth.session.id;
      client.isAuthenticated = true;
      client.ws.send(pack({
        type: 'auth_success',
        user: auth.user
      }));
    } else {
      client.ws.send(pack({
        type: 'auth_failed',
        error: 'Invalid or expired token'
      }));
    }
  },

  join_room: async (client, msg) => {
    const roomId = msg.roomId || 'lobby';
    await joinRoom(client, roomId);

    const roomClients = filterClientsByRoom(roomId, client);

    client.ws.send(pack({
      type: 'room_joined',
      roomId,
      currentUsers: roomClients.map(c => ({
        id: c.id,
        username: c.username,
        isBot: c.isBot,
        isAuthenticated: c.isAuthenticated
      }))
    }));

    broadcast({
      type: 'user_joined',
      user: client.username,
      userId: client.id,
      isBot: client.isBot,
      isAuthenticated: client.isAuthenticated
    }, client, roomId);

    const recentMsgs = await messages.getRecent(roomId, 50);
    if (recentMsgs.length > 0) {
      client.ws.send(pack({
        type: 'message_history',
        messages: recentMsgs
      }));
    }
  },

  audio_start: async (client) => {
    client.speaking = true;
    const mediaSessionId = await media.createSession(client.roomId, client.id, client.username);
    state.mediaSessions.set(client.id, mediaSessionId);
    broadcast({
      type: 'speaker_joined',
      user: client.username,
      userId: client.id
    }, null, client.roomId);
  },

  audio_chunk: async (client, msg) => {
    const mediaSessionId = state.mediaSessions.get(client.id);
    if (mediaSessionId) {
      await media.saveChunk(client.roomId, client.id, 'audio', msg.data, mediaSessionId);
    }
    broadcast({
      type: 'audio_data',
      userId: client.id,
      data: msg.data
    }, client, client.roomId);
  },

  audio_end: async (client) => {
    client.speaking = false;
    const mediaSessionId = state.mediaSessions.get(client.id);
    if (mediaSessionId) {
      await media.endSession(client.roomId, mediaSessionId);
      state.mediaSessions.delete(client.id);
    }
    broadcast({
      type: 'speaker_left',
      userId: client.id,
      user: client.username
    }, null, client.roomId);
  },

  video_chunk: async (client, msg) => {
    const mediaSessionId = state.mediaSessions.get(client.id);
    if (mediaSessionId) {
      await media.saveChunk(client.roomId, client.id, 'video', msg.data, mediaSessionId);
    }
    broadcast({
      type: 'video_chunk',
      userId: client.id,
      data: msg.data
    }, client, client.roomId);
  },

  text_message: async (client, msg) => {
    const msgData = await messages.save(client.roomId, {
      userId: client.id,
      username: client.username,
      type: 'text',
      content: msg.content
    });

    broadcast({
      type: 'text_message',
      ...msgData,
      isAuthenticated: client.isAuthenticated
    }, null, client.roomId);
  },

  image_message: async (client, msg) => {
    const imageBuffer = Buffer.from(msg.data, 'base64');
    const fileMeta = await files.save(
      client.roomId,
      client.id,
      msg.filename || 'image.png',
      imageBuffer,
      'images'
    );

    const msgData = await messages.save(client.roomId, {
      userId: client.id,
      username: client.username,
      type: 'image',
      content: msg.caption || '',
      metadata: {
        fileId: fileMeta.id,
        filename: fileMeta.originalName,
        size: fileMeta.size,
        mimeType: fileMeta.mimeType
      }
    });

    broadcast({
      type: 'image_message',
      ...msgData,
      isAuthenticated: client.isAuthenticated
    }, null, client.roomId);
  },

  file_upload_start: async (client, msg) => {
    broadcast({
      type: 'file_upload_started',
      userId: client.id,
      username: client.username,
      filename: msg.filename,
      size: msg.size,
      uploadId: msg.uploadId
    }, null, client.roomId);
  },

  file_upload_chunk: async (client, msg) => {
  },

  file_upload_complete: async (client, msg) => {
    const fileBuffer = Buffer.from(msg.data, 'base64');
    const fileMeta = await files.save(
      client.roomId,
      client.id,
      msg.filename,
      fileBuffer,
      msg.path || ''
    );

    const msgData = await messages.save(client.roomId, {
      userId: client.id,
      username: client.username,
      type: 'file',
      content: msg.description || '',
      metadata: {
        fileId: fileMeta.id,
        filename: fileMeta.originalName,
        size: fileMeta.size,
        mimeType: fileMeta.mimeType,
        path: fileMeta.path
      }
    });

    broadcast({
      type: 'file_shared',
      ...msgData,
      isAuthenticated: client.isAuthenticated
    }, null, client.roomId);
  },

  set_username: async (client, msg) => {
    client.username = msg.username;
    broadcast({
      type: 'user_updated',
      userId: client.id,
      username: msg.username
    }, null, client.roomId);
  },

  get_messages: async (client, msg) => {
    const msgs = await messages.getRecent(client.roomId, msg.limit || 50, msg.before);
    client.ws.send(pack({
      type: 'message_history',
      messages: msgs
    }));
  },

  get_files: async (client, msg) => {
    const fileList = await files.list(client.roomId, msg.path || '');
    client.ws.send(pack({
      type: 'file_list',
      files: fileList,
      path: msg.path || ''
    }));
  }
};


wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const isBot = url.pathname === '/api/bot/ws';

  if (isBot) {
    const botConn = new BotConnection(ws, broadcast, state);
    ws.on('message', (data) => botConn.handleMessage(data.toString()));
    ws.on('close', () => botConn.cleanup());
    return;
  }

  const clientId = ++state.counter;
  const token = url.searchParams.get('token');

  let user = null;
  if (token) {
    const auth = await authenticateWebSocket(token);
    if (auth) {
      user = auth.user;
    }
  }

  const client = createClient(ws, clientId, user);
  state.clients.set(ws, client);

  ws.on('message', async (data) => {
    try {
      const msg = unpack(Buffer.isBuffer(data) ? data : Buffer.from(data));
      const handler = handlers[msg.type];
      if (handler) {
        await handler(client, msg);
      }
    } catch (e) {
      logger.error('[WS] Message error:', e.message);
    }
  });

  ws.on('close', async () => {
    if (client.speaking === true) {
      broadcast({
        type: 'speaker_left',
        userId: clientId,
        user: client.username
      }, null, client.roomId);
    }
    await leaveRoom(client);
    state.clients.delete(ws);
    broadcast({
      type: 'user_left',
      userId: clientId
    }, null, client.roomId);
  });

  ws.send(pack({
    type: 'connection_established',
    clientId,
    user: user ? { id: user.id, username: user.username, displayName: user.displayName } : null
  }));
});


app.post('/api/auth/register', async (req, res) => {
  const { username, password, displayName } = req.body;
  const result = await register(username, password, displayName);
  if (result.error) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password, deviceName, userAgent } = req.body;
  const result = await login(username, password, { name: deviceName, userAgent });
  if (result.error) {
    return res.status(401).json(result);
  }
  res.json(result);
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
  await logout(req.session.id);
  res.json({ success: true });
});

app.post('/api/auth/logout-all', requireAuth, async (req, res) => {
  const count = await logoutAll(req.user.id);
  res.json({ success: true, sessionsInvalidated: count });
});

app.get('/api/user', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

app.patch('/api/user', requireAuth, async (req, res) => {
  const { displayName, settings } = req.body;
  const updates = {};

  if (displayName) {
    const result = await updateDisplayName(req.user.id, displayName);
    if (result.error) {
      return res.status(400).json(result);
    }
    updates.displayName = result.displayName;
  }

  if (settings) {
    updates.settings = await updateSettings(req.user.id, settings);
  }

  res.json(updates);
});

app.post('/api/user/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const result = await changePassword(req.user.id, currentPassword, newPassword);
  if (result.error) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.get('/api/sessions', requireAuth, async (req, res) => {
  const sessions = await getActiveSessions(req.user.id);
  res.json({ sessions });
});

app.get('/api/devices', requireAuth, async (req, res) => {
  const devices = await getDevices(req.user.id);
  res.json({ devices });
});

app.delete('/api/devices/:deviceId', requireAuth, async (req, res) => {
  await removeDevice(req.user.id, req.params.deviceId);
  res.json({ success: true });
});

app.get('/api/rooms', async (req, res) => {
  const roomList = [];
  for (const [roomId, users] of state.roomUsers.entries()) {
    roomList.push({
      id: roomId,
      userCount: users.size
    });
  }
  res.json({ rooms: roomList });
});

app.get('/api/rooms/:roomId', async (req, res) => {
  const roomId = req.params.roomId;
  const users = Array.from(state.clients.values())
    .filter(c => c.roomId === roomId)
    .map(c => ({
      id: c.id,
      username: c.username,
      speaking: c.speaking,
      isBot: c.isBot,
      isAuthenticated: c.isAuthenticated
    }));

  const meta = await rooms.getMeta(roomId);

  res.json({
    roomId,
    users,
    userCount: users.length,
    meta
  });
});

app.get('/api/rooms/:roomId/files', async (req, res) => {
  const fileList = await files.list(req.params.roomId, req.query.path || '');
  res.json({ files: fileList });
});

app.get('/api/rooms/:roomId/files/:fileId', async (req, res) => {
  const file = await files.get(req.params.roomId, req.params.fileId);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  const { promises: fs } = await import('fs');
  const data = await fs.readFile(file.filepath);

  res.set('Content-Type', file.meta?.mimeType || 'application/octet-stream');
  res.set('Content-Disposition', `attachment; filename="${file.meta?.originalName || 'download'}"`);
  res.send(data);
});

app.get('/api/rooms/:roomId/messages', async (req, res) => {
  const msgs = await messages.getRecent(
    req.params.roomId,
    parseInt(req.query.limit) || 50,
    req.query.before ? parseInt(req.query.before) : null
  );
  res.json({ messages: msgs });
});

setupBotApiRoutes(app, state, broadcast);

// LiveKit setup - cache SDK import and build static config once
let _lkSdk = null;
const lkConfig = {
  url: process.env.LIVEKIT_URL || '',
  apiKey: process.env.LIVEKIT_API_KEY || '',
  apiSecret: process.env.LIVEKIT_API_SECRET || '',
  turnUrl: process.env.LIVEKIT_TURN_URL || '',
  turnUsername: process.env.LIVEKIT_TURN_USERNAME || '',
  turnCredential: process.env.LIVEKIT_TURN_CREDENTIAL || '',
};

async function getLkSdk() {
  if (!_lkSdk) _lkSdk = await import('livekit-server-sdk');
  return _lkSdk;
}

// Pre-build ICE server list once (immutable at runtime)
const iceServers = (() => {
  const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (lkConfig.turnUrl && lkConfig.turnUsername && lkConfig.turnCredential) {
    servers.push({ urls: [lkConfig.turnUrl], username: lkConfig.turnUsername, credential: lkConfig.turnCredential });
  }
  return servers;
})();
const hasTurn = iceServers.length > 1;

// LiveKit token endpoint
app.get('/api/livekit/token', optionalAuth, async (req, res) => {
  const { channel, identity, forceRelay } = req.query;
  if (!channel || !identity) return res.status(400).json({ error: 'channel and identity required' });
  if (identity.length > 128 || channel.length > 64) return res.status(400).json({ error: 'identity or channel too long' });

  if (!lkConfig.url || !lkConfig.apiKey || !lkConfig.apiSecret) {
    return res.status(503).json({ error: 'LiveKit not configured' });
  }

  try {
    const { AccessToken } = await getLkSdk();
    const roomName = `zellous-${channel}`;
    const token = new AccessToken(lkConfig.apiKey, lkConfig.apiSecret, { identity, ttl: '6h' });
    token.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true, canPublishData: true });
    const jwt = await token.toJwt();

    let rtcConfig = undefined;
    if (hasTurn) {
      rtcConfig = { iceServers };
      if (forceRelay === 'true') rtcConfig = { iceServers, iceTransportPolicy: 'relay' };
    }

    res.json({ token: jwt, url: lkConfig.url, rtcConfig });
  } catch (e) {
    logger.error('[LiveKit] Token generation failed:', e.message);
    res.status(500).json({ error: 'Failed to generate voice token' });
  }
});


const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const startServer = async () => {
  await initialize();

  startCleanup();

  const shutdown = async () => {
    logger.info('\n[Server] Shutting down...');
    stopCleanup();

    for (const client of state.clients.values()) {
      client.ws.close();
    }

    server.close(() => {
      logger.info('[Server] Closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(PORT, HOST, () => {
    logger.info(`[Zellous] Server running on http://${HOST}:${PORT}`);
    logger.info(`[Zellous] Data directory: ${DATA_ROOT}`);
  });
};

startServer().catch(console.error);

export { app, server, state, broadcast };
