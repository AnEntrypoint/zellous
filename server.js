import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pack, unpack } from 'msgpackr';
import cors from 'cors';

// Server modules
import {
  initStorage, rooms, messages, media, files,
  startCleanupProcessor, stopCleanupProcessor, DATA_ROOT
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

// Middleware
app.use(cors({
  origin: true, // Allow all origins for iframe embedding
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// Allow iframe embedding from OS.js instances
app.use((req, res, next) => {
  // Remove restrictive X-Frame-Options to allow embedding
  res.removeHeader('X-Frame-Options');
  // Allow embedding from any origin (or specify specific origins)
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://os.247420.xyz https://*.247420.xyz http://localhost:* http://127.0.0.1:*");
  next();
});

app.use(express.static(__dirname));
app.use(optionalAuth);

// ==================== SERVER STATE ====================

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

// ==================== BROADCAST ====================

const broadcast = (msg, exclude = null, roomId = null) => {
  const data = pack(msg);
  for (const client of state.clients.values()) {
    if (client.ws.readyState === 1 && client !== exclude && (!roomId || client.roomId === roomId)) {
      client.ws.send(data);
    }
  }
};

// ==================== ROOM MANAGEMENT ====================

const joinRoom = async (client, roomId) => {
  const oldRoomId = client.roomId;

  // Leave old room
  if (oldRoomId && state.roomUsers.has(oldRoomId)) {
    state.roomUsers.get(oldRoomId).delete(client.id);
    if (state.roomUsers.get(oldRoomId).size === 0) {
      state.roomUsers.delete(oldRoomId);
      // Schedule cleanup after 10 minutes of emptiness
      await rooms.scheduleCleanup(oldRoomId);
    }
  }

  // Join new room
  client.roomId = roomId;
  if (!state.roomUsers.has(roomId)) {
    state.roomUsers.set(roomId, new Set());
    // Cancel any pending cleanup
    await rooms.cancelCleanup(roomId);
  }
  state.roomUsers.get(roomId).add(client.id);

  // Update room storage
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

// ==================== MESSAGE HANDLERS ====================

const handlers = {
  // Authentication
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

  // Room management
  join_room: async (client, msg) => {
    const roomId = msg.roomId || 'lobby';
    await joinRoom(client, roomId);

    const roomClients = Array.from(state.clients.values())
      .filter(c => c.roomId === roomId && c !== client);

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

    // Send recent messages
    const recentMsgs = await messages.getRecent(roomId, 50);
    if (recentMsgs.length > 0) {
      client.ws.send(pack({
        type: 'message_history',
        messages: recentMsgs
      }));
    }
  },

  // Audio
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

  // Video
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

  // Text messaging
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

  // Image message (inline display)
  image_message: async (client, msg) => {
    // Save image file
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

  // File transfer
  file_upload_start: async (client, msg) => {
    // Notify room that file upload is starting
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
    // For chunked uploads - accumulate chunks
    // This is handled by the file upload endpoint
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

  // User settings
  set_username: async (client, msg) => {
    client.username = msg.username;
    broadcast({
      type: 'user_updated',
      userId: client.id,
      username: msg.username
    }, null, client.roomId);
  },

  // Fetch message history
  get_messages: async (client, msg) => {
    const msgs = await messages.getRecent(client.roomId, msg.limit || 50, msg.before);
    client.ws.send(pack({
      type: 'message_history',
      messages: msgs
    }));
  },

  // Fetch file list
  get_files: async (client, msg) => {
    const fileList = await files.list(client.roomId, msg.path || '');
    client.ws.send(pack({
      type: 'file_list',
      files: fileList,
      path: msg.path || ''
    }));
  }
};

// ==================== WEBSOCKET CONNECTION ====================

wss.on('connection', async (ws, req) => {
  // Check if this is a bot connection
  const url = new URL(req.url, `http://${req.headers.host}`);
  const isBot = url.pathname === '/api/bot/ws';

  if (isBot) {
    // Handle bot WebSocket connection
    const botConn = new BotConnection(ws, broadcast, state);
    ws.on('message', (data) => botConn.handleMessage(data.toString()));
    ws.on('close', () => botConn.cleanup());
    return;
  }

  // Regular user connection
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
      console.error('[WS] Message error:', e.message);
    }
  });

  ws.on('close', async () => {
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

// ==================== REST API ROUTES ====================

// Auth routes
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

// User routes
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

// Session routes
app.get('/api/sessions', requireAuth, async (req, res) => {
  const sessions = await getActiveSessions(req.user.id);
  res.json({ sessions });
});

// Device routes
app.get('/api/devices', requireAuth, async (req, res) => {
  const devices = await getDevices(req.user.id);
  res.json({ devices });
});

app.delete('/api/devices/:deviceId', requireAuth, async (req, res) => {
  await removeDevice(req.user.id, req.params.deviceId);
  res.json({ success: true });
});

// Room routes
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

// File routes
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

// Message routes
app.get('/api/rooms/:roomId/messages', async (req, res) => {
  const msgs = await messages.getRecent(
    req.params.roomId,
    parseInt(req.query.limit) || 50,
    req.query.before ? parseInt(req.query.before) : null
  );
  res.json({ messages: msgs });
});

// Setup bot API routes
setupBotApiRoutes(app, state, broadcast);

// ==================== SERVER STARTUP ====================

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const startServer = async () => {
  // Initialize storage
  await initStorage();

  // Start cleanup processor
  startCleanupProcessor();

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n[Server] Shutting down...');
    stopCleanupProcessor();

    // Close all WebSocket connections
    for (const client of state.clients.values()) {
      client.ws.close();
    }

    server.close(() => {
      console.log('[Server] Closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(PORT, HOST, () => {
    console.log(`[Zellous] Server running on http://${HOST}:${PORT}`);
    console.log(`[Zellous] Data directory: ${DATA_ROOT}`);
  });
};

startServer().catch(console.error);

// Export for testing
export { app, server, state, broadcast };
